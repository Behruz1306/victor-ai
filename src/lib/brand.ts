// Product name lives here only. Rename the product by editing this file.
export const BRAND = {
  name: "Victor AI",
  /** Telegram bot the demo deployment talks through (display name "Victor AI"). */
  botUsername: "victorai5_bot",
  tagline: {
    en: "We read your team's chats for you and drive every customer task to completion.",
    ru: "Читаем чаты вашей команды за вас и доводим каждую задачу клиента до результата.",
  },
  ownerPromise: {
    en: "You never have to open the chats again.",
    ru: "Вам больше не нужно открывать чаты.",
  },
} as const;

/** Cookie / storage key prefix. Changing it signs everyone out (harmless). */
export const STORAGE_PREFIX = "victor_";
export const THEME_COOKIE = `${STORAGE_PREFIX}theme`;
