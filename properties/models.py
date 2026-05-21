from django.db import models
from django.utils.text import slugify

class Property(models.Model):

    PROPERTY_TYPES = (
        ('residential', 'Residential'),
        ('commercial', 'Commercial'),
    )

    title = models.CharField(max_length=255)

    slug = models.SlugField(
        unique=True,
        blank=True
    )

    property_type = models.CharField(
        max_length=20,
        choices=PROPERTY_TYPES
    )

    description = models.TextField()

    address = models.TextField()

    city = models.CharField(max_length=100)

    bedrooms = models.IntegerField(default=0)

    bathrooms = models.IntegerField(default=0)

    area = models.CharField(max_length=100)

    price = models.CharField(max_length=100)

    featured_image = models.ImageField(
        upload_to='properties/'
    )

    is_active = models.BooleanField(
        default=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    def save(self, *args, **kwargs):

        if not self.slug:

            base_slug = slugify(self.title)

            slug = base_slug

            counter = 1

            while Property.objects.filter(slug=slug).exists():

                slug = f"{base_slug}-{counter}"

                counter += 1

            self.slug = slug

        self.is_active = True

        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class PropertyImage(models.Model):

    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name='gallery'
    )

    image = models.ImageField(
        upload_to='property_gallery/'
    )