# Створення та відновлення бекапу бази даних (Docker)

## Опис

Скидання схеми та відновлення даних PostgreSQL з архіву в Docker-контейнері.

## Команди / Код

```bash
docker exec -i <container_name> psql -U <db_user> -d <db_name> -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
zcat <backup_file_path> | docker exec -i <container_name> psql -U <db_user> -d <db_name>
```
