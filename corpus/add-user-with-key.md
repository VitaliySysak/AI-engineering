# Створення користувача з SSH-ключем та sudo

## Опис

Скрипт для безпечного створення користувача з паролем, генерації SSH-ключа та надання прав sudo.

## Команди / Код

```bash
useradd -m -s /bin/bash <username>
usermod -aG sudo <username>
PASSWORD="<password>"
HASH=$(echo -n "$PASSWORD" | openssl passwd -6 -stdin)
echo "<username>:$HASH" | chpasswd -e
echo "<username> ALL=(ALL:ALL) ALL" > /etc/sudoers.d/<username>

chmod 440 /etc/sudoers.d/<username>

mkdir -p /home/<username>/.ssh

ssh-keygen -t rsa -b 4096 -m PEM -f /home/<username>/.ssh/<username>-key -N "" -q

cat /home/<username>/.ssh/<username>-key.pub >> /home/<username>/.ssh/authorized_keys

chmod 700 /home/<username>/.ssh
chmod 600 /home/<username>/.ssh/authorized_keys

chown -R <username>:<username> /home/<username>

cat /home/<username>/.ssh/<username>-key
```
