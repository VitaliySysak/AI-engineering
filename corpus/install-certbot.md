# Встановлення Certbot

## Опис

Встановлення Certbot через Snap для автоматичного отримання SSL-сертифікатів.

## Команди / Код

```bash
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx
```
