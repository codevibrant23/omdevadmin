require('dotenv').config();
const express = require('express');
const nunjucks = require('nunjucks');
const path = require('path');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { Pool } = require('pg');
const slugify = require('slugify');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const app = express();

// Initialize DB Table
const initDB = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS property (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      property_type VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      address TEXT NOT NULL,
      city VARCHAR(100) NOT NULL,
      bedrooms INTEGER DEFAULT 0,
      bathrooms INTEGER DEFAULT 0,
      area VARCHAR(100) NOT NULL,
      price VARCHAR(100) NOT NULL,
      featured_image TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(query);
    console.log("Database initialized");
  } catch (err) {
    console.error("Error initializing database", err);
  }
};

initDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(session({
    secret: 'omdev-secret-key-neon-vercel',
    resave: false,
    saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, '../public')));

// Nunjucks config
nunjucks.configure(path.join(__dirname, '../views'), {
    autoescape: true,
    express: app
});
app.set('view engine', 'html');

// Add user to locals for views
app.use((req, res, next) => {
    res.locals.request = {
        user: req.session.user || null
    };
    next();
});

// Auth Middleware
const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Multer for memory storage (images converted to base64)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Routes

app.get('/login', (req, res) => {
    res.render('login.html');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin') {
        req.session.user = { username: 'admin' };
        res.redirect('/');
    } else {
        res.render('login.html', { error: 'Invalid credentials' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM property ORDER BY id DESC');
        res.render('dashboard.html', { properties: result.rows });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get('/add-property', requireAuth, (req, res) => {
    res.render('property_form.html');
});

app.post('/add-property', requireAuth, upload.single('featured_image'), async (req, res) => {
    try {
        const data = req.body;
        let base_slug = slugify(data.title, { lower: true });
        let slug = base_slug;
        let counter = 1;
        
        while (true) {
            const slugCheck = await pool.query('SELECT id FROM property WHERE slug = $1', [slug]);
            if (slugCheck.rows.length === 0) break;
            slug = `${base_slug}-${counter}`;
            counter++;
        }

        let featured_image = '';
        if (req.file) {
            const b64 = req.file.buffer.toString('base64');
            featured_image = `data:${req.file.mimetype};base64,${b64}`;
        }

        const query = `
            INSERT INTO property (title, slug, property_type, description, address, city, bedrooms, bathrooms, area, price, featured_image)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        const values = [
            data.title, slug, data.property_type, data.description, data.address, data.city,
            parseInt(data.bedrooms) || 0, parseInt(data.bathrooms) || 0, data.area, data.price, featured_image
        ];
        await pool.query(query, values);
        
        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.status(500).send("Error saving property");
    }
});

app.get('/edit-property/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const result = await pool.query('SELECT * FROM property WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).send('Not found');
        res.render('property_form.html', { property: result.rows[0] });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.post('/edit-property/:id', requireAuth, upload.single('featured_image'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const data = req.body;

        if (req.file) {
            const b64 = req.file.buffer.toString('base64');
            const featured_image = `data:${req.file.mimetype};base64,${b64}`;
            const query = `
                UPDATE property SET title=$1, property_type=$2, description=$3, address=$4, city=$5, bedrooms=$6, bathrooms=$7, area=$8, price=$9, featured_image=$10
                WHERE id=$11
            `;
            const values = [
                data.title, data.property_type, data.description, data.address, data.city,
                parseInt(data.bedrooms) || 0, parseInt(data.bathrooms) || 0, data.area, data.price, featured_image, id
            ];
            await pool.query(query, values);
        } else {
            const query = `
                UPDATE property SET title=$1, property_type=$2, description=$3, address=$4, city=$5, bedrooms=$6, bathrooms=$7, area=$8, price=$9
                WHERE id=$10
            `;
            const values = [
                data.title, data.property_type, data.description, data.address, data.city,
                parseInt(data.bedrooms) || 0, parseInt(data.bathrooms) || 0, data.area, data.price, id
            ];
            await pool.query(query, values);
        }

        res.redirect('/');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get('/delete-property/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await pool.query('DELETE FROM property WHERE id = $1', [id]);
        res.redirect('/');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// APIs
app.get('/api/properties', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM property WHERE is_active = true ORDER BY id DESC');
        res.json({ error: false, message: "Properties fetched successfully", data: result.rows });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

app.get('/api/property/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const result = await pool.query('SELECT * FROM property WHERE id = $1 AND is_active = true', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: true, message: "Property not found" });
        res.json({ error: false, message: "Property details fetched successfully", data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

module.exports = app;

if (require.main === module) {
    app.listen(3000, () => {
        console.log('Server is running on http://localhost:3000');
    });
}
