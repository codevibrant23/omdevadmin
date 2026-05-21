from django import forms
from .models import Property


class PropertyForm(forms.ModelForm):

    class Meta:

        model = Property

        exclude = ['slug', 'is_active']

        widgets = {

            'description': forms.Textarea(
                attrs={
                    'rows': 5
                }
            )

        }