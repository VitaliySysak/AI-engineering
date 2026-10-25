# scripts/search.ts --answer · 2026-10-25

Гілка `lab2/step-05`, коміт `65d8e48` (валідатор цитат — код курсу). Модель — `gemini-3.5-flash-lite`, системний
промпт — той самий, що в базовій лінії (`SYSTEM_PROMPT` у `scripts/baseline.ts`). Вивід дослівно.

## 1. q-08 «Як прокинути порт з віддаленого сервера на локальну машину через SSH?»

```text
$ npx tsx --env-file=.env.local scripts/search.ts "Як прокинути порт з віддаленого сервера на локальну машину через SSH?" --answer
Порогу відмови на рівні пошуку немає (див. retrieval.md, розділ 4): відмовляє модель.
Запит: «Як прокинути порт з віддаленого сервера на локальну машину через SSH?»

Щоб прокинути порт з віддаленого сервера на локальну машину через SSH, виконайте наступну команду на вашій локальній машині:

```bash
ssh -N -L <local_port>:localhost:<remote_port> <username>@<ip_address>
```

Ця команда дозволяє підключитися до віддаленої бази даних або іншого сервісу через захищений SSH-тунель [local-port-forward#0001, local-port-forward#0002].

Видані фрагменти:
  [local-port-forward#0000] local-port-forward › Прокидання локального порту через SSH · символи 0–41 · cosine=0.8406 rrf=0.03252
  [local-port-forward#0001] local-port-forward › Прокидання локального порту через SSH › Опис · символи 41–154 · cosine=0.7812 rrf=0.03175
  [certbot-nginx#0001] certbot-nginx › Конфігурація Nginx для Certbot та Proxy › Опис · символи 43–157 · cosine=0.6483 rrf=0.03068
  [local-port-forward#0002] local-port-forward › Прокидання локального порту через SSH › Команди / Код · символи 154–255 · cosine=0.8053 rrf=0.03062
  [private-github-repository-access#0002] private-github-repository-access › Доступ до приватного GitHub репозиторію › Команди / Код · символи 140–441 · cosine=0.6766 rrf=0.03030

validateAnswer: у відповіді немає жодної цитати
Токени: вхід 558, вихід 118
```

Валідатор курсу шукав лише `[id]` в окремих дужках і не побачив списку `[a, b]`. Після виправлення
(`citedIds` у `src/rag/cite.ts`) та сама відповідь, перевірена без мережі тим самим списком виданих фрагментів:
`validateAnswer: проблем 0`.

## 2. q-17 (unanswerable) «Як закрити всі порти фаєрволом ufw, залишивши тільки SSH, HTTP і HTTPS?»

```text
$ npx tsx --env-file=.env.local scripts/search.ts "Як закрити всі порти фаєрволом ufw, залишивши тільки SSH, HTTP і HTTPS?" --answer
Порогу відмови на рівні пошуку немає (див. retrieval.md, розділ 4): відмовляє модель.
Запит: «Як закрити всі порти фаєрволом ufw, залишивши тільки SSH, HTTP і HTTPS?»

Я не знаю відповіді на це питання, оскільки в наданих документах немає інформації про налаштування фаєрвола ufw [certbot-nginx#0002], [local-port-forward#0000], [local-port-forward#0002], [add-user-with-key#0002], [add-user-with-key#0000].

Видані фрагменти:
  [certbot-nginx#0002] certbot-nginx › Конфігурація Nginx для Certbot та Proxy › Команди / Код · символи 157–1266 · cosine=0.6338 rrf=0.03132
  [local-port-forward#0000] local-port-forward › Прокидання локального порту через SSH · символи 0–41 · cosine=0.6496 rrf=0.03126
  [local-port-forward#0002] local-port-forward › Прокидання локального порту через SSH › Команди / Код · символи 154–255 · cosine=0.6415 rrf=0.03033
  [add-user-with-key#0002] add-user-with-key › Створення користувача з SSH-ключем та sudo › Команди / Код · символи 153–836 · cosine=0.6277 rrf=0.02991
  [add-user-with-key#0000] add-user-with-key › Створення користувача з SSH-ключем та sudo · символи 0–46 · cosine=0.6293 rrf=0.02986

validateAnswer: проблем 0
Токени: вхід 1021, вихід 92
```

Відмова правильна (у базовій лінії на q-17 модель видала інструкцію ufw із загальних знань — `wrong`). Але модель
«процитувала» всі п'ять виданих фрагментів у самій відмові, і валідатор це пропустив: цитати є і всі видані.
