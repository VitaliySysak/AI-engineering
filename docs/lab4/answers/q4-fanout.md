# q4 (fanout): Які модулі зачепить зміна в lib/helpers/combineURLs.js і що про це каже історія?
Зміна в модулі lib/helpers/combineURLs.js зачепить файл lib/core/buildFullPath.js, який напряму імпортує цей помічник, а також модулі тестів tests/unit/helpers/combineURLs.test.js, tests/unit/adapters/fetch.test.js і tests/unit/prototypePollution.test.js. Сам модуль призначений для об'єднання базової та відносної URL-адрес із коректною обробкою слешів. Історія файлу налічує шість комітів, серед яких виправлення ReDoS та нормалізація повторюваних слешів.
| твердження | посилання | вердикт |
|---|---|---|
| Модуль lib/helpers/combineURLs.js напряму імпортується у файлі lib/core/buildFullPath.js | lib/core/buildFullPath.js:5 | pass |
| Історія файлу містить важливий коміт 02c2c4f8 із виправленням нормалізації слешів | коміт 02c2c4f8 | pass |
| Файл тестів tests/unit/helpers/combineURLs.test.js містить перевірки для цього модуля | tests/unit/helpers/combineURLs.test.js:2 | pass |
Згенеровано 2026-11-25T13:07:10.627Z; trace a61860db60e4dbca3cbf05f41bdff48f.
