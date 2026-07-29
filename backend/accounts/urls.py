from django.urls import path

from .views import me
from .views import list_users, user_detail
from .views import admin_password_reset, force_change_password
from .views_2fa import enroll_2fa, verify_2fa, verify_login_otp

urlpatterns = [
    path("users/me", me, name="users-me"),
    path("users", list_users, name="users-list"),
    path("users/<int:pk>", user_detail, name="users-detail"),
    path("admin/password-reset", admin_password_reset, name="admin-password-reset"),
    path("auth/force-change-password", force_change_password, name="auth-force-change-password"),
    path("auth/2fa/enroll", enroll_2fa, name="auth-2fa-enroll"),
    path("auth/2fa/verify", verify_2fa, name="auth-2fa-verify"),
    path("auth/2fa/login-verify", verify_login_otp, name="auth-2fa-login-verify"),
]
