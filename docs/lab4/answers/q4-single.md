# q4 (single): Які модулі зачепить зміна в lib/helpers/combineURLs.js і що про це каже історія?
Зміна в модулі lib/helpers/combineURLs.js напряму зачепить залежний модуль lib/core/buildFullPath.js, який імпортує цю функцію. Також зміни вплинуть на юніт-тести та адаптери, які покладаються на коректне об'єднання URL-адрес. Історія комітів демонструє еволюцію модуля від базового створення до важливих виправлень безпеки від ReDoS та нормалізації слешів.
| твердження | посилання | вердикт |
|---|---|---|
| Модуль імпортується у lib/core/buildFullPath.js | lib/core/buildFullPath.js:5 | pass |
| Історія містить коміт виправлення ReDoS | коміт 5e7ad38f | pass |
| Модуль згадується у тестовому файлі tests/unit/helpers/combineURLs.test.js | tests/unit/helpers/combineURLs.test.js:2 | pass |
Згенеровано 2026-11-26T11:50:16.956Z; trace 1f1db4dd8aa66e7f63ae21ec28be6583.
