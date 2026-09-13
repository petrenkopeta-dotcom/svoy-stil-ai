# CV: готовность моделей, 13 сентября 2026

Статус: **commercial NO-GO; исследовательский shortlist, не модельная валидация**.
Найдены реальные checkpoint и совместимые по исходникам API. Веса не скачивались,
Torch/Transformers не устанавливались, inference не запускался. Проверка полного
комплекта на реальных весах ещё обязательна. Запрет фото по умолчанию остаётся.
Это оценка достаточности свидетельств для допуска, не юридическое заключение.

## Комплект и первичные источники

«Генерация» здесь означает выделение исходных пикселей одежды маской, а не
дорисовку скрытых человеком частей вещи. Репозитории и точные ревизии сохранены
в `runtime/cv/model-selection.json`; это каталог, **не загрузочный manifest**.
Ревизии получены из публичного HF API 13 сентября, а не придуманы по именам.

| Роль | Checkpoint и лицензия по первичному источнику | Классы / интерфейс | Размер тензоров FP32¹ | Ограничение |
| --- | --- | --- | --- | --- |
| generator_detector | [IDEA-Research/grounding-dino-tiny](https://huggingface.co/IDEA-Research/grounding-dino-tiny/tree/a2bb814dd30d776dcf7e30523b00659f4f141c71), Apache-2.0 по card | Открытый словарь; prompts только из garment_labels; AutoModelForZeroShotObjectDetection | ≈689 МБ | Прямоугольник не гарантирует одежду без кожи; объединённая/неизвестная текстовая метка отвергается |
| generator_segmenter | [facebook/sam2.1-hiera-tiny](https://huggingface.co/facebook/sam2.1-hiera-tiny/tree/de431c4043854a71d8101e17995dfe596bf101a5), Apache-2.0 по card | Без семантических классов; boxes → Sam2Model → boolean mask | ≈156 МБ | Snapshot имеет sam2_video; image API допускает video-only лишние ключи по встроенному списку Transformers; это ещё требует реальной загрузки |
| verifier_presence | [google/owlv2-base-patch16-ensemble](https://huggingface.co/google/owlv2-base-patch16-ensemble/tree/cfd3195ba4ea9592eec887ded089f4c08eff231d), Apache-2.0 по card | Owlv2Processor/ForObjectDetection; фиксированные queries `a person`, `a human face`, индексы 0/1 | ≈620 МБ | Zero-shot запрос лица **не доказывает recall лица**. Не специализированный face detector; threshold 0.05 не калиброван |
| verifier_semantic | [mattmdjaga/segformer_b2_clothes](https://huggingface.co/mattmdjaga/segformer_b2_clothes/tree/584abc1e1d260e23c0fc627c5217a09b2b461046), card `other`, ссылается на NVIDIA SegFormer license | SegformerForSemanticSegmentation; ATR, 18 классов, включая фон/волосы/лицо/конечности и одежду | ≈109 МБ | П.3.3 указанной лицензии ограничивает research/evaluation. Коммерческий допуск не подтверждён; на вырезках вне распределения ATR качество неизвестно |

¹ Расчёт по числу тензорных элементов HF metadata × 4 байта (у DINO дополнительно
I64). Источники: [DINO API](https://huggingface.co/api/models/IDEA-Research/grounding-dino-tiny),
[SAM API](https://huggingface.co/api/models/facebook/sam2.1-hiera-tiny),
[OWL API](https://huggingface.co/api/models/google/owlv2-base-patch16-ensemble),
[ATR API](https://huggingface.co/api/models/mattmdjaga/segformer_b2_clothes).
Итого около 1.57 ГБ только тензоров, **не RAM/VRAM процесса**. Пиковая память не
измерена. При 12 Мп один 18-канальный FP32 semantic tensor занимает 864 МБ;
одновременные logits и softmax — уже около 1.73 ГБ сверх моделей, входов и прочего.
Нельзя выбирать сервер по размеру файлов весов.

## Лицензии и ограниченный поиск альтернатив

Модельная card SegFormer прямо отсылает к [NVIDIA Source Code License,
редакция 1022b45](https://github.com/NVlabs/SegFormer/blob/1022b45ddb0d18c6288683d60139ac9b1e83a5f2/LICENSE).
П.3.3 допускает research/evaluation, а не коммерческое использование.
MIT у [репозитория training code автора](https://github.com/mattmdjaga/segformer_b2_clothes)
не заменяет указанную автором лицензию весов. Dataset card сообщает ATR;
разрешения на данные обучения и цепочка производных весов отдельно не доказаны.
Apache-2.0 у трёх других cards также не доказывает полноту provenance данных.

Проверенные альтернативы не дают основания объявить коммерческий комплект:

| Альтернатива | Свидетельство и причина не принимать сейчас |
| --- | --- |
| [Itbanque/fashion_segformer](https://huggingface.co/Itbanque/fashion_segformer) | Card Apache-2.0, но прямо указана база nvidia/mit-b3. Нужна проверка совместимости лицензии производных весов; 48 классов также потребуют отдельной taxonomy |
| [isjackwild/segformer-b0-finetuned-segments-skin-hair-clothing](https://huggingface.co/isjackwild/segformer-b0-finetuned-segments-skin-hair-clothing) | MIT в metadata, основной текст card — незаполненный шаблон, нет подтверждённой цепочки базовых весов/обучения |
| [UseItOrLoseIt/clothing-segmentation-segformer-b0](https://huggingface.co/UseItOrLoseIt/clothing-segmentation-segformer-b0) | MIT в card, инструкция использует .pth и свой код; не готовый проверенный safetensors/Transformers snapshot; происхождение весов требует проверки |
| [facebook/detr-resnet-50](https://huggingface.co/facebook/detr-resnet-50) | COCO person, но нет face; не замена всей роли presence |

Следующий путь: получить документированное разрешение правообладателей или
заменить semantic роль checkpoint с проверенной разрешённой цепочкой весов и
данных. Переписывание licence metadata, форматная конверсия и совпадение API
такого разрешения не создают. Переписку/покупки в этой итерации не выполняли.

## Что исправлено и что требования означают

- Старый closed-set presence адаптер требовал одновременно person+face.
  Найденный COCO вариант не мог удовлетворить это требование. Новый research
  адаптер использует другой обученный детектор OWLv2 с явными запросами, а не
  выдаёт COCO за face detector. Это смена исследовательской гипотезы, не доказательство безопасности.
- ATR `Upper-clothes` сопоставлен с верхней одеждой, `Pants` — с pants/jeans/shorts,
  `Left-shoe` + `Right-shoe` — с shoe; dress/skirt/bag напрямую. Проверяется точная
  таблица всех 18 id из [pinned config](https://huggingface.co/mattmdjaga/segformer_b2_clothes/blob/584abc1e1d260e23c0fc627c5217a09b2b461046/config.json).
  Кожа, лицо, волосы, фон, очки и аксессуары вне разрешённого набора не разрешаются.
  Такая проверка не подтверждает подтип вещи: shirt и jacket имеют общий класс.
- Генератор использует только настроенные garment_labels. Независимый verifier
  по-прежнему проверяет объединение разрешённых категорий, не метку генератора.
- Проверяются NaN/Inf presence logits/boxes до threshold-фильтра, чтобы NaN
  не превращался в пустой список детекций. Semantic NaN/Inf также отвергается.
- Все модели загружаются с output_loading_info: missing/unexpected/mismatched
  keys и error_msgs ведут к отказу после встроенных исключений самой архитектуры.
  Проверка не заменяет parity benchmark конвертированных весов.

API сопоставлены с **4.56.1**, а не с плавающей документацией main:
[GroundingDINO threshold/text_labels](https://github.com/huggingface/transformers/blob/v4.56.1/src/transformers/models/grounding_dino/processing_grounding_dino.py),
[SAM masks/original_sizes](https://github.com/huggingface/transformers/blob/v4.56.1/src/transformers/models/sam2/processing_sam2.py),
[SAM image loader и исключения video-only ключей](https://github.com/huggingface/transformers/blob/v4.56.1/src/transformers/models/sam2/modeling_sam2.py),
[OWL indices и post_process_object_detection](https://github.com/huggingface/transformers/blob/v4.56.1/src/transformers/models/owlv2/image_processing_owlv2.py).

Требование «каждый видимый пиксель имеет garment probability ≥0.995 на белом
и чёрном фоне» сохранено. Оно не математически невозможно, но может отвергать
почти все полезные вырезки: softmax не калиброван, особенно на границах и новых
фонах. Нельзя снижать порог ради числа сохранений без отдельного evidence review.
«Абсолютно ни одного человеческого пикселя на произвольном фото» не доказуемо
конечным benchmark вероятностных моделей. Distinct hashes/архитектуры не означают
независимость ошибок или непересечение обучающих данных.

## Manifest v2 и контракт интеграции

JSONL **protocol:1** и операции `analyze`/`verify` не меняются. Генератор получает
RGB Pillow image в памяти и возвращает до трёх `{label, mask}`. Verifier получает
свежедекодированный точный RGBA PNG и visible mask, возвращает строго булевы
personPresent/facePresent/garmentOnly. SHA256 связывает решение с выходными PNG
байтами, не с исходным фото. `productionApproved:false` всегда; повторный verify
при confirmation остаётся обязательным. Таймаут/ошибка/неполный manifest — отказ.

Загрузочный JSON имеет **ровно** поля `schema_version:2`, `versions`,
`garment_labels`, `models`. `versions` должен точно совпадать с:

```json
{"torch":"2.8.0","torchvision":"0.23.0","transformers":"4.56.1","accelerate":"1.10.1","numpy":"2.3.5","Pillow":"12.3.0"}
```

`models` содержит ровно четыре роли из таблицы. В каждой — ровно `repository`
(owner/name), `revision` (40 lowercase hex), `directory` (относительный POSIX
путь внутри CV_MODEL_ROOT), `sha256` (относительное имя каждого локального файла
→ фактический 64 lowercase hex). Требуются config.json и safetensors; полный
набор имеющихся файлов должен совпадать с картой хешей. Пути с `..`, абсолютные,
backslash/drive paths, symlink/junction, pickle/.bin/.pt/.pth/.py отвергаются.
Проверяются model_type и отсутствие config auto_map. Роли не могут разделять
каталог или safetensors file hash. Защита от изменения файлов после проверки
требует read-only deployment snapshot и прав ОС; manifest не является подписью.

Старые manifests **пересоздать вручную после проверки**, не мигрировать молча.
Каталог model-selection.json нельзя передавать worker: в нём нет локальных hashes.
Хеши весов здесь отсутствуют намеренно: веса не получены и локально не проверены.
Repository revision фиксирует provenance-заявление; сам по себе этот текст не
подтверждает, что содержимое локального snapshot получено именно из него.
При подготовке разрешённого offline snapshot сверить SHA256 каждого файла с
независимо проверенным источником, потом вычислить локально; маленькие config и
processor/tokenizer файлы также хешировать. Не брать весь HF repo с optimizer,
pickle и handler.py. Не выдумывать checksums и не запускать автоматическую докачку.

Пины top-level сохранены в requirements-models.txt, проверяются до импорта Torch.
Это **не полный transitive lock**. До benchmark нужен lock для выбранных OS,
Python, CPU/CUDA wheel index и platform tags с hashes всех wheels. CUDA suffix
версии пока не различается loader: точную сборку должен фиксировать deployment
lock. Текущий адаптер работает на CPU/FP32 с двумя потоками; GPU SLO не заявлен.

## Протокол настоящего benchmark (ещё не запускался)

1. Допуск среды: существующая согласованная российская машина без покупки,
   подтверждённый бюджет теста и всего месяца ≤5000 руб. Не использовать ноутбук
   для тяжёлых весов. Без согласованной среды этап заблокирован. Зафиксировать
   hardware, OS/Python, полный lock, model manifest digest, лицензии, версии
   supervisor и CV; отключить сеть, swap, core dumps, image temp/spooling.
2. Dataset хранить локально вне Git. Не загружать пользовательские фото наружу.
   Разделить calibration и holdout по исходным объектам/людям; заморозить split
   до настройки порогов. Разметить отдельно clothing/person/face/skin/hair/background.
   Включить flat-lay и одежду на людях, пальцы на краях, ноги у обуви, маленькие
   лица/профиль/отражения, принты лиц, манекены, прозрачность, кружева, мех,
   волосы, складки, тени, низкий контраст, белую/чёрную одежду и плохое освещение.
3. Offline preflight: проверка всех hashes, загрузка всех четырёх моделей без
   download и missing/mismatched parameters. Сбой — STOP, никаких заглушек.
   Синтетический пробный input проверяет только интеграцию, не качество.
4. Время через настоящий JS supervisor: cold process spawn → imports → hashing →
   load → decode → DINO/SAM → все проверки PNG → ответ. Не исключать cold start.
   Минимум 10 отдельных cold запусков и 100 warm запросов разных размеров
   (включая лимиты 10 МБ/4096 px/12 Мп), 0/1/3 кандидата; confirmation отдельно.
   Различать OS cache-cold и process-cold. Один активный job; нагрузочный тест
   проверяет busy/reject, а не скрытую очередь. Лимит 20 секунд применяется к
   каждому запросу; целевой p95 ≤10 секунд отдельно проверить. Запросы, убитые
   по deadline, включать в failure rate и не выдавать за быстрые успешные.
5. Память: peak RSS/PSS, peak VRAM если появится отдельный GPU adapter, отсутствие
   swap/pagefile writes и фото в logs/tmp/dumps. Файловую активность смотреть
   средствами ОС, а не только mock(open). Измерить idle и worst-case 12 Мп.
6. Качество: на holdout посчитать unsafe accepted / unsafe tested отдельно для
   face/person/body/background и safe accepted / safe tested; маски leakage,
   сохранность вещи, долю no_candidates/rejected, min garment probability и
   максимальные presence scores. Verifier проверить отдельно на заведомо опасных
   RGBA в памяти и затем end-to-end на реальных кандидатах; include black/white.
   Ручная независимая разметка обязательна. Хранить агрегаты и локальные opaque
   case IDs, не фото/base64/исходные имена/hashes в Git или telemetry.
7. Любой unsafe accepted — NO-GO этой версии. Ноль ошибок также не доказывает
   абсолютную безопасность: например, при 0/300 независимых unsafe случаев
   верхняя односторонняя 95% биномиальная граница около 1% (1−0.05^(1/300)).
   Требуемую допустимую границу риска и минимальную полезность ещё должен
   определить владелец продукта; без них release не разрешать.
8. Confirmation повторно проверяет те же байты; mismatch/timeout/restart,
   недоступный verifier, tampered snapshot и конфигурации должны отказать.
   Отчёт с фактами/неизвестным передать координатору; никакого авто-merge/deploy.

Пока не доказаны: коммерческие права полного набора, полный lock, загрузка
конвертированного SAM, face recall, пригодность ATR для cutouts, полезный yield
при 0.995, cold/warm SLO, пиковая память, стоимость месяца и no-disk на уровне ОС.

## Проверки этой итерации и следующий шаг

`python -B -m unittest discover -s runtime/cv -p 'test_*.py'`: **14 passed**
на bundled Python с NumPy 2.3.5/Pillow 12.3.0. Новые проверки: старые/неполные
manifests, revision/paths/hashes, pickle, точная ATR taxonomy, incomplete load,
фиксированные presence queries на двух фонах, один плохой visible pixel, NaN.
Реальные пиксельные codec tests и injected tensor tests — разные категории
свидетельств; ни одна не заменяет inference выбранных checkpoint.

`node --test server/memoryCvWorker.test.js server/garmentPhotoFlow.test.js`:
**7 passed**, включая реальное завершение зависшего OS-процесса, default deny
и confirmation. `node scripts/check-repository-boundary.mjs` и
`git diff --check`: passed. Node 489/build/browser всей системы здесь повторно
не запускались: UI/server файлы не менялись; их прежние результаты не объявлены
проверкой новых реальных моделей.

Следующая конкретная задача: закрыть разрешения/provenance semantic роли и
согласовать существующую российскую offline benchmark среду. До этого от
пользователя не требуется скачивать веса или оплачивать ресурсы; разрешение
на оплату/публикацию этой работой не запрашивается. Интеграция и merge — координатор.

## Дополнение: три альтернативы semantic verifier, 13 сентября 2026

Ограниченный поиск завершён на **трёх** семействах: U²-Net clothes,
SCHP-ATR и Sapiens-0.3B segmentation. Другие семейства в этой итерации не
исследовались. Все три имеют реальный опубликованный checkpoint для одежды,
но **ни у одного не подтверждена вся разрешительная цепочка для нашего
коммерческого сценария**. Это отсутствие достаточного основания для допуска,
а не утверждение, что любая модель, обученная на таких данных, незаконна.
Код адаптеров и manifest после 191bc6f не менялись.

### 1. U²-Net clothes — потенциально меньший охват, незакрытая цепочка

Проверена [ревизия 28392f0](https://github.com/levindabhi/cloth-segmentation/tree/28392f0da3aa5eb9ae64db73d04b31be10ce6350).
[Лицензия кода](https://github.com/levindabhi/cloth-segmentation/blob/28392f0da3aa5eb9ae64db73d04b31be10ce6350/LICENSE)
— MIT, copyright Levin Dabhi 2021. README связывает проект с готовым checkpoint
по Google Drive, около 165 МБ, но отдельного документа о применении лицензии
к конкретному бинарному файлу и цепочке его базовых весов не найдено.
Это не отказ в лицензии; охват должен быть подтверждён.

Происхождение не ограничено обучением «с нуля»: официальный
[model_surgery.py](https://github.com/levindabhi/cloth-segmentation/blob/28392f0da3aa5eb9ae64db73d04b31be10ce6350/model_surgery.py)
загружает базовый u2net.pth и переносит параметры совпадающих размеров.
У [оригинального U²-Net](https://github.com/xuebinqin/U-2-Net) код Apache-2.0;
README описывает базовую saliency-модель, обученную на DUTS-TR. Это основание
проверять происхождение, но не доказательство тождества скачиваемого базового
файла или полной истории опубликованного clothing checkpoint.

Известные данные: clothing README указывает 45 тысяч изображений iMaterialist
Fashion 2019. [Официальная страница правил](https://www.kaggle.com/competitions/imaterialist-fashion-2019-FGVC6/rules)
при проверке не отдала читаемый текст — условия нельзя додумать. Для базы
[авторы DUTS](https://saliencydetection.net/duts/) указывают ImageNet DET/SUN
как источники, а для разметки сохраняют все права. Разрешение на требуемое
коммерческое обучение/использование производных весов отдельно не установлено.

Выход: background, upper-body clothes, lower-body clothes, full-body clothes.
Верхняя одежда соответствует общему upper-классу; pants/skirt — lower;
dress — full-body. Обувь и сумки не имеют выделенного допустимого класса —
их пришлось бы исключить из охвата. Точный список исходных 42 категорий,
сведённых в три, ещё требует проверки перед mapping. Нужен собственный
in-memory U²-Net adapter с per-pixel logits; .pth и пример с файловым I/O
в текущий loader не допускаются. Конверсия формата не устраняет вопросы прав.

**Решение: NO-GO сейчас.** Даже ограничение до трёх групп одежды не закрывает
лицензирование. Отсутствие отдельных face/body классов нельзя компенсировать
отказом от независимой presence-проверки.

### 2. SCHP-ATR — ближе всего к текущей taxonomy, но разрешение не доказано

Проверена [ревизия eb84c43](https://github.com/GoGoDuck912/Self-Correction-Human-Parsing/tree/eb84c432cc697f494d99662a05f2335eb2f26095).
[Код лицензирован MIT](https://github.com/GoGoDuck912/Self-Correction-Human-Parsing/blob/eb84c432cc697f494d99662a05f2335eb2f26095/LICENSE),
copyright Peike Li 2020. Рассматривается именно опубликованный в README
`exp-schp-201908301523-atr.pth`, а не Pascal Person Part, у которого body-part
классы не отделяют одежду. SHA256 файла не проверялся: весов не скачивали.

В [train.py](https://github.com/GoGoDuck912/Self-Correction-Human-Parsing/blob/eb84c432cc697f494d99662a05f2335eb2f26095/train.py)
по умолчанию используется `resnet101-imagenet.pth`. Для указанного финального
checkpoint не установлены точная исходная ревизия/hash базовых весов и
документ, подтверждающий коммерческий охват всех производных компонентов.
Наличие параметра обучения не доказывает, что опубликованный бинарник
получен именно этой командой. Также используется InplaceSyncBN: при переносе
потребуется учёт лицензий и совместимости зависимостей, не только файла LICENSE.

Известные данные — ATR. В [первичном репозитории ATR](https://github.com/lemondan/HumanParsing-Dataset)
авторы просят цитирование для academic и commercial research. Это полезное
свидетельство намерения, но не полное разрешение на production-сервис,
перераспространение весов и права на все исходные фотографии. Эти вопросы
остаются открытыми; отсутствие отдельного LICENSE не трактуется как разрешение.

18 ATR-классов совпадают с текущим набором: Upper-clothes, Skirt, Pants, Dress,
Left/Right-shoe, Bag отдельно от Face/Hair/Arms/Legs/Background. Продуктовое
сопоставление можно сохранить после проверки точного порядка id. Нужен
отдельный SCHP/ResNet adapter вместо SegformerForSemanticSegmentation,
без дискового extractor; logits надо получать в памяти до argmax.
Нужны разрешённый safetensors snapshot и parity-проверка конверсии; поддержка
наших версий Torch, память и задержка не измерялись.

**Решение: NO-GO сейчас; первый кандидат для адресного уточнения прав**, потому
что сохраняет одежду/обувь/сумки и ATR taxonomy. Это рекомендация по следующей
проверке документов, не по скачиванию или включению в сервис.

### 3. Sapiens-0.3B segmentation — явное non-commercial ограничение

Код: [ревизия 2cb0722](https://github.com/facebookresearch/sapiens/tree/2cb07227a740cf09896309ea3a3b8fa44429865c).
[Корневая лицензия](https://github.com/facebookresearch/sapiens/blob/2cb07227a740cf09896309ea3a3b8fa44429865c/LICENSE)
— CC BY-NC 4.0; README отдельно отмечает Apache-2.0 только для производных
сторонних частей. Checkpoint:
[facebook/sapiens-seg-0.3b, c87c2c6](https://huggingface.co/facebook/sapiens-seg-0.3b/tree/c87c2c6e5fc5e9630adfbcd1cc91a228064eee46),
`sapiens_0.3b_goliath_best_goliath_mIoU_7673_epoch_194.pth`, также CC BY-NC 4.0.
Разрешение Apache у частей кода не отменяет NC у checkpoint.

Цепочка по первичным описаниям: pretraining Sapiens на более чем 300 млн
человеческих изображений → segmentation finetuning Goliath. Данные и обучение
описаны в [статье авторов v3](https://arxiv.org/abs/2408.12569v3), но полный
реестр прав исходных изображений этой проверкой не подтверждён. Уже явного
NC-ограничения достаточно для нашего NO-GO без коммерческого разрешения.

[Официальная taxonomy](https://github.com/facebookresearch/sapiens/blob/2cb07227a740cf09896309ea3a3b8fa44429865c/docs/SEG_README.md)
содержит Upper_Clothing, Lower_Clothing, Left/Right_Shoe и отдельные body/face
классы. Apparel нельзя автоматически считать допустимой одеждой без уточнения
разметки. Dress/bag не имеют однозначного отдельного mapping в показанном списке.
Нужны Sapiens adapter и перевод .pth; текущий SegFormer loader несовместим.
Семейство 0.3B и высокое входное разрешение добавляют риск бюджета/памяти;
конкретных runtime-измерений нет. **Решение: NO-GO, не приоритет для бюджета проекта.**

### Какое разрешение или замена действительно закроют блокер

Ниже требования к документам, **не отправленное письмо**. От имени пользователя
к авторам никто не обращался. Для SCHP-ATR либо текущего SegFormer необходимо:

1. Указать юридического правообладателя и конкретный checkpoint: имя файла,
   неизменяемый источник/revision и проверяемый hash; перечислить базовые веса,
   версии кода и сторонние части, на которые распространяется разрешение.
2. Подтвердить право коммерческого server-side inference в российском VK Mini
   App, обработки фото пользователей в памяти, хранения только проверенных
   вырезок одежды и использования результата пользователем; отдельно — право
   конверсии/модификации весов и хранения offline-копии на российском backend.
3. Явно снять применимые research-only/NC ограничения уполномоченными лицами.
   Разрешение только автора fine-tune не закрывает ограничения базовой модели,
   если он не вправе разрешать её использование. Зафиксировать обязательные
   attribution, ограничения территории/сценария и необходимость иных разрешений.
4. Приложить сведения об известных данных и основаниях обучения/коммерческого
   применения производных весов; отдельно обозначить исключения и неизвестные.
   Не требовать или передавать фото пользователей для такого уточнения.

Альтернатива письму — другой semantic checkpoint с этой цепочкой документов.
Техническая спецификация: независимо обученная от DINO/SAM per-pixel модель;
как минимум garment против всего остального, предпочтительно отдельные
skin/hair/face/background; недвусмысленные допустимые классы; CPU-compatible
in-memory API, logits до argmax, safetensors без custom remote code, точный
processor и manifest. Нельзя заменять semantic verifier генератором маски
или одной только детекцией отсутствия человека. Новая модель заново проходит
benchmark, calibration и release review; лицензия сама по себе этого не заменяет.

### Меньший функциональный охват без ослабления safety

**Доступный сейчас вариант:** гардероб только из ручных метаданных — категория,
цвет, сезон, текстовое описание; подбор сочетаний без загрузки/хранения фото.
Photo admission остаётся false. Пользовательское «подтверждаю, что человека нет»,
ручной crop, flat-lay или прозрачный PNG не заменяют verifier и не дают обхода.
Это рекомендация объёма продукта; UI/server в этой итерации не изменялись.

**Возможный следующий этап, пока не разрешённый:** только плоско разложенные
верхние вещи и брюки с исключением обуви, сумок, манекенов и одежды на человеке.
Это уменьшает область benchmark, но требует разрешённой бинарной semantic
модели и прежних независимых person/face проверок каждого PNG на двух фонах,
повторного verify при confirmation, no-disk и лимита 20 секунд. Пороги здесь
не снижаются; сам режим съёмки не является доказательством безопасности.
Собственное обучение на документированно разрешённых данных — отдельный проект
с неизвестной стоимостью, не выполненная и не оплаченная работа.

Итог этой ограниченной проверки: готовой разрешённой замены нет. Следующий
конкретный шаг — проверка документов/разрешения для SCHP-ATR либо выбор
metadata-only объёма до появления такого основания. Проверен только текст
документа и `git diff --check`; предыдущие 14 Python/7 Node относятся к 191bc6f,
не к качеству перечисленных альтернатив. Новых весов, hashes весов и запусков нет.

### Reuse / adapt / build: решение по тем же трём кандидатам

Учтён приоритет готовых открытых решений. Поиск не расширяется: открытый
репозиторий не равен готовому разрешённому privacy pipeline.

| Кандидат | Решение после закрытия прав | Что переиспользовать / что обязательно адаптировать | Ограничение стоимости и надёжности |
| --- | --- | --- | --- |
| SCHP-ATR | **Adapt**, первый в очереди проверки прав | Существующие architecture, weights и ATR taxonomy; новый тонкий in-memory adapter, conversion/parity, pin зависимостей вместо своего обучения | CPU/RAM/SLO не измерены; CUDA/InplaceSyncBN примеры не доказательство CPU-готовности; оценить перенос до выбора |
| U²-Net clothes | **Adapt**, только если подтверждены права и пользователь выберет меньший охват | Готовые сеть и checkpoint; сохранить только inference без gdown и дискового I/O, вернуть logits | 165 МБ checkpoint не оценка peak RAM; код архивирован, сопровождение и CPU/20с надо проверить; три coarse класса ограничивают продукт |
| Sapiens-0.3B | **Не reuse сейчас** | Готовое решение существует, но NC и необходимая смена runtime не дают текущего допуска | Большая модель/высокое разрешение без измерений не обосновывают лимит 5000 руб.; разрешение и benchmark нужны до адаптации |

**Build** собственной модели не выбран: он добавляет сбор разрешённых данных,
разметку, обучение и сопровождение с неизвестным бюджетом. Сначала проверять
возможность законного reuse/adapt. Ни один upstream demo не использовать как
готовый privacy pipeline: они допускают файловые входы/выходы, а наш контракт
требует памяти, независимой проверки и default deny.

Metadata-only и only-flatlay выше — **только предложения**. UX и функциональный
охват не изменены; выбор пользователя должен происходить после отдельной
визуализации вариантов в продуктовом направлении. Эта проверка не делает такой
выбор за пользователя и не выдаёт разрешения на реализацию ограничения.
