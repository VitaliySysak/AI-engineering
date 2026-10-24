# Доступ до приватного GitHub репозиторію

## Опис

Генерація SSH-ключа для конкретного проєкту та налаштування git для його використання.

## Команди / Код

```bash
# генерація ключа доступу
ssh-keygen -t ed25519 -f ~/.ssh/<ssh_key_name> -N "" -q

# налаштування доступу для проєкту
git config --global core.sshCommand 'ssh -i ~/.ssh/<ssh_key_name> -o IdentitiesOnly=yes'

git clone git@github.com:<github_user>/<repository_name>.git .
```
