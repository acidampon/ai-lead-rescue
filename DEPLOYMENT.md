# Deployment

The repository includes a Dockerfile and Render manifest. Configure PostgreSQL and production secrets before accepting real customer data.

Required production values include NODE_ENV=production, AUTH_REQUIRED=true, DATABASE_URL, DATABASE_SSL=true, CORS_ORIGIN, and secure AI/email credentials when those integrations are enabled.
