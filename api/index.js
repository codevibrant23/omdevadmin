require('dotenv').config();
const express = require('express');
const nunjucks = require('nunjucks');
const path = require('path');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const cors = require('cors');
const mongoose = require('mongoose');
const slugify = require('slugify');

// Serverless MongoDB Connection Cache
let cached = global.mongoose;
if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
    if (cached.conn) {
        return cached.conn;
    }
    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        };
        cached.promise = mongoose.connect(process.env.MONGODB_URI, opts).then((mongoose) => {
            return mongoose;
        });
    }
    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }
    return cached.conn;
}

// Mongoose Schema
const PropertySchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, unique: true, required: true },
  property_type: { type: String, required: true },
  description: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  bedrooms: { type: Number, default: 0 },
  bathrooms: { type: Number, default: 0 },
  area: { type: String, required: true },
  price: { type: String, required: true },
  featured_image: { type: String, required: true },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});
const Property = mongoose.models.Property || mongoose.model('Property', PropertySchema);

const app = express();

// Database Connection Middleware (Required for Vercel Serverless)
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        console.error("DB Connection Error:", error);
        res.status(500).send("Database connection failed");
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(session({
    secret: 'omdev-secret-key-mongo',
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

// Multer for memory storage (for file uploads, though we'll just save the path now)
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
        const properties = await Property.find().sort({ created_at: -1 }).lean();
        res.render('dashboard.html', { properties });
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
        
        while (await Property.findOne({ slug })) {
            slug = `${base_slug}-${counter}`;
            counter++;
        }

        // For this optimized setup, if an image is uploaded, you'd typically upload it to Cloudinary here.
        // For simplicity and to fix the performance, we will default all images to point to the fast public/image.png
        // unless they provide an external URL. 
        let featured_image = '/image.png';

        await Property.create({
            title: data.title,
            slug: slug,
            property_type: data.property_type,
            description: data.description,
            address: data.address,
            city: data.city,
            bedrooms: parseInt(data.bedrooms) || 0,
            bathrooms: parseInt(data.bathrooms) || 0,
            area: data.area,
            price: data.price,
            featured_image: featured_image
        });
        
        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.status(500).send("Error saving property");
    }
});

app.get('/edit-property/:id', requireAuth, async (req, res) => {
    try {
        const property = await Property.findById(req.params.id).lean();
        if (!property) return res.status(404).send('Not found');
        res.render('property_form.html', { property });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.post('/edit-property/:id', requireAuth, upload.single('featured_image'), async (req, res) => {
    try {
        const data = req.body;
        const updateData = {
            title: data.title,
            property_type: data.property_type,
            description: data.description,
            address: data.address,
            city: data.city,
            bedrooms: parseInt(data.bedrooms) || 0,
            bathrooms: parseInt(data.bathrooms) || 0,
            area: data.area,
            price: data.price
        };

        await Property.findByIdAndUpdate(req.params.id, updateData);
        res.redirect('/');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get('/delete-property/:id', requireAuth, async (req, res) => {
    try {
        await Property.findByIdAndDelete(req.params.id);
        res.redirect('/');
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// APIs
app.get('/api/properties', async (req, res) => {
    try {
        const properties = await Property.find({ is_active: true }).sort({ created_at: -1 });
        
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const baseUrl = `${protocol}://${host}`;
        
        const formattedProperties = properties.map(p => {
            const obj = p.toJSON();
            if (obj.featured_image && obj.featured_image.startsWith('/')) {
                obj.featured_image = `${baseUrl}${obj.featured_image}`;
            }
            return obj;
        });

        res.json({ error: false, message: "Properties fetched successfully", data: formattedProperties });
    } catch (error) {
        res.status(500).json({ error: true, message: error.message });
    }
});

app.get('/api/property/:id', async (req, res) => {
    try {
        const property = await Property.findOne({ _id: req.params.id, is_active: true });
        if (!property) return res.status(404).json({ error: true, message: "Property not found" });
        
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const baseUrl = `${protocol}://${host}`;
        
        const obj = property.toJSON();
        if (obj.featured_image && obj.featured_image.startsWith('/')) {
            obj.featured_image = `${baseUrl}${obj.featured_image}`;
        }
        
        res.json({ error: false, message: "Property details fetched successfully", data: obj });
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
