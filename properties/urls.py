from django.urls import path
from . import views

urlpatterns = [

    path('', views.dashboard, name='dashboard'),

    path(
        'add-property/',
        views.add_property,
        name='add_property'
    ),

    path(
        'edit-property/<int:pk>/',
        views.edit_property,
        name='edit_property'
    ),

    path(
        'delete-property/<int:pk>/',
        views.delete_property,
        name='delete_property'
    ),
    # APIs
    path(
        'api/properties/',
        views.property_list_api,
        name='property_list_api'
    ),

    path(
        'api/property/<int:property_id>/',
        views.property_detail_api,
        name='property_detail_api'
    ),
]