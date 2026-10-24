# Конфігурація Nginx для Certbot та Proxy

## Опис

Налаштування веб-сервера Nginx для роботи з HTTPS, Certbot та проксіювання запитів на локальний сервіс.

## Команди / Код

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name <domain>;

    location ~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    location / {
        proxy_pass http://127.0.0.1:<port>;
        proxy_intercept_errors on;
    }
    error_page 502 504 = /maintenance.html;
    location = /maintenance.html {
        root <maintenance_path>;
        internal;
    }
}

sudo ln -s /etc/nginx/sites-available/<app_name> /etc/nginx/sites-enabled/

sudo certbot --nginx -d <domain> -d www.<domain>

# Приклад з розширеними заголовками
server {
    server_name <domain>;

    location / {
        proxy_pass http://localhost:<port>;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
