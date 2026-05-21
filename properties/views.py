from django.shortcuts import render, redirect, get_object_or_404
from .models import Property
from .forms import PropertyForm
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.forms.models import model_to_dict
from django.views.decorators.csrf import csrf_exempt

@login_required
def dashboard(request):

    properties = Property.objects.all()

    return render(
        request,
        'dashboard.html',
        {
            'properties': properties
        }
    )

@login_required
def add_property(request):

    form = PropertyForm(request.POST or None, request.FILES or None)

    if form.is_valid():
        form.save()
        return redirect('dashboard')

    return render(
        request,
        'property_form.html',
        {
            'form': form
        }
    )

@login_required
def edit_property(request, pk):

    property = get_object_or_404(Property, pk=pk)

    form = PropertyForm(
        request.POST or None,
        request.FILES or None,
        instance=property
    )

    if form.is_valid():
        form.save()
        return redirect('dashboard')

    return render(
        request,
        'property_form.html',
        {
            'form': form
        }
    )

@login_required
def delete_property(request, pk):

    property = get_object_or_404(Property, pk=pk)

    property.delete()

    return redirect('dashboard')




@csrf_exempt
def property_list_api(request):

    properties = Property.objects.filter(
        is_active=True
    ).order_by('-id')

    data = []

    for property in properties:

        data.append({

            "id": property.id,

            "title": property.title,

            "slug": property.slug,

            "property_type": property.property_type,

            "description": property.description,

            "address": property.address,

            "city": property.city,

            "bedrooms": property.bedrooms,

            "bathrooms": property.bathrooms,

            "area": property.area,

            "price": property.price,

            "featured_image": request.build_absolute_uri(
                property.featured_image.url
            ),

            "created_at": property.created_at,

        })

    return JsonResponse({

        "error": False,

        "message": "Properties fetched successfully",

        "data": data

    })



@csrf_exempt
def property_detail_api(request, property_id):

    try:

        property = Property.objects.get(
            id=property_id,
            is_active=True
        )

        data = {

            "id": property.id,

            "title": property.title,

            "slug": property.slug,

            "property_type": property.property_type,

            "description": property.description,

            "address": property.address,

            "city": property.city,

            "bedrooms": property.bedrooms,

            "bathrooms": property.bathrooms,

            "area": property.area,

            "price": property.price,

            "featured_image": request.build_absolute_uri(
                property.featured_image.url
            ),

            "created_at": property.created_at,

        }

        return JsonResponse({

            "error": False,

            "message": "Property details fetched successfully",

            "data": data

        })

    except Property.DoesNotExist:

        return JsonResponse({

            "error": True,

            "message": "Property not found"

        }, status=404)