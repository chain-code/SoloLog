import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { getItem, removeItem, setItem } from "@/utils/storage";

const TOKEN_KEY = "TOKEN";
const USERNAME_KEY = "USERNAME";

export const useUserStore = defineStore("user", () => {
  const token = ref<string>(getItem(TOKEN_KEY) ?? "");
  const username = ref<string>(getItem(USERNAME_KEY) ?? "Guest");
  const isLoggedIn = computed(() => Boolean(token.value));

  function setToken(nextToken: string) {
    token.value = nextToken;
    if (nextToken) {
      setItem(TOKEN_KEY, nextToken);
    } else {
      removeItem(TOKEN_KEY);
    }
  }

  function setUsername(nextUsername: string) {
    username.value = nextUsername;
    if (nextUsername) {
      setItem(USERNAME_KEY, nextUsername);
    } else {
      removeItem(USERNAME_KEY);
    }
  }

  function logout() {
    setToken("");
    setUsername("Guest");
  }

  return {
    token,
    username,
    isLoggedIn,
    setToken,
    setUsername,
    logout,
  };
});
