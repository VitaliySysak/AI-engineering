# scripts/search.ts --golden · 2026-10-25

Індекс: `data/index.json` (`google:gemini-embedding-2@768`, 30 фрагментів), коміт гілки `lab2/step-05` `695fd16`.
Команда: `npx tsx --env-file=.env.local scripts/search.ts --golden`. Вивід дослівно:

| id | tags | must_cite | вектор | слова | RRF | у топ-5 RRF | косинус топ-1 | фрагментів у BM25 |
|---|---|---|---|---|---|---|---|---|
| q-01 | easy | add-user-with-key | 1 | 3 | 1 | так | 0.7726 | 11 |
| q-02 | easy | add-user-with-key | 1 | 3 | 1 | так | 0.7026 | 9 |
| q-03 | easy | certbot-nginx | 1 | 2 | 2 | так | 0.7808 | 8 |
| q-04 | easy | backup | 1 | 1 | 1 | так | 0.7949 | 6 |
| q-05 | easy | install-docker | 1 | 1 | 1 | так | 0.7569 | 14 |
| q-06 | easy | private-github-repository-access | 1 | 2 | 1 | так | 0.7749 | 11 |
| q-07 | easy | add-shortcut | 1 | 8 | 3 | так | 0.7464 | 15 |
| q-08 | easy | local-port-forward | 1 | 2 | 1 | так | 0.8406 | 11 |
| q-09 | easy | check-open-ports | 1 | немає | 2 | так | 0.7521 | 1 |
| q-10 | easy | install-certbot | 1 | 2 | 1 | так | 0.7889 | 7 |
| q-11 | hard | install-nginx, install-certbot, certbot-nginx | 1 | 1 | 1 | так | 0.7762 | 5 |
| q-12 | hard | backup, local-port-forward | 1 | 1 | 1 | так | 0.7891 | 8 |
| q-13 | hard | add-user-with-key, private-github-repository-access | 1 | 1 | 1 | так | 0.7377 | 13 |
| q-14 | hard | install-docker, certbot-nginx | 1 | 1 | 1 | так | 0.7094 | 10 |
| q-15 | hard | certbot-nginx, check-open-ports | 2 | 2 | 2 | так | 0.6860 | 8 |
| q-16 | unanswerable | — | — | — | — | — | 0.6985 | 16 |
| q-17 | unanswerable | — | — | — | — | — | 0.6804 | 11 |
| q-18 | unanswerable | — | — | — | — | — | 0.7081 | 6 |
| q-19 | injection, easy | backup | 1 | 1 | 1 | так | 0.8385 | 6 |
| q-20 | injection, hard | add-user-with-key | 1 | 1 | 1 | так | 0.7172 | 8 |

Ранги — найкращий 1-based ранг будь-якого фрагмента документа з must_cite; «немає» — гілка його не знайшла.
Вектор ранжує всі 30 фрагментів; у злиття йде топ-20 кожної гілки.
