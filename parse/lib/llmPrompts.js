const AGE_RULES = `"age": только одно из трёх значений, ничего другого не пиши:
   - "young" — щенок/котёнок или до 1 года (упоминания: месяц, неделя, month, week, kitten, puppy, baby и т.п.)
   - "adult" — взрослое животное, от 1 года (упоминания: год, лет, year, adult и т.п.)
   - "no-info" — возраст не указан или не понятен`;

const BREED_RULES = `"breed": тип и порода на английском. Строго в формате:
   - "cat" или "dog" — если порода не указана
   - "cat:British Shorthair", "dog:sheepdog" и т.п. — если порода указана
   - Если нет информации о животном — "no-info"
   Всегда указывай тип (cat/dog) в начале, если он известен.`;

export function siteAdPrompt() {
  return `Ты анализируешь объявления о животных с сайтов объявлений. Верни ТОЛЬКО валидный JSON, без пояснений и лишнего текста.

Правила для каждого поля (строго соблюдай допустимые значения, иначе ответ неверный):

1. ${AGE_RULES}

2. ${BREED_RULES}

Ответь строго в таком формате JSON:
{"age": "young", "breed": "cat:British Shorthair"}

Заголовок:
«{{TITLE}}»

Описание:
«{{DESCRIPTION}}»

JSON-ответ:`;
}

export function telegramPrompt() {
  return `Ты анализируешь сообщения из Telegram-канала о животных. Верни ТОЛЬКО валидный JSON, без пояснений и лишнего текста.

Правила для каждого поля (строго соблюдай допустимые значения, иначе ответ неверный):

1. "is_adoption_search": true, если сообщение — призыв отдать/найти хозяина животному (человек ищет дом/хозяина для кошки, собаки и т.п.). Иначе false.

2. ${AGE_RULES}

3. ${BREED_RULES}

4. "city": город на сербском, строго одно из: Beograd, Novi Sad, Subotica, Zrenjanin, Niš, Kragujevac, Mladenovac, Pančevo, Kruševac, Čačak, Valjevo, Šabac, Obrenovac, Leskovac, Kraljevo. Если город не указан или его нет в списке — "no-info".

Ответь строго в таком формате JSON:
{"is_adoption_search": true, "age": "young", "breed": "cat:British Shorthair", "city": "Beograd"}

Сообщение:
«{{TEXT}}»

JSON-ответ:`;
}