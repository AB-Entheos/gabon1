from django.urls import path

from .views import confirm_payment, export_payments, mobile_money_push

app_name = "payments"

urlpatterns = [
    path("payments/export", export_payments, name="payments-export"),
    path("payments/mobile-money", mobile_money_push, name="payments-mobile-money"),
    path("payments/<caseuid:uid>/confirm", confirm_payment, name="payments-confirm"),
]
