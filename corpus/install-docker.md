# Встановлення Docker (Rootful та Rootless)

## Опис

Скрипт для встановлення Docker з офіційних репозиторіїв та налаштування rootless-режиму для користувача.

## Команди / Код

```bash
# Встановлення Docker
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Rootless режим
curl -fsSL https://get.docker.com/rootless | sh

export PATH=/home/$USER/bin:$PATH
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock

systemctl --user start docker
systemctl --user enable docker
sudo loginctl enable-linger $USER
```
