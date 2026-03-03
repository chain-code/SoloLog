<template>
  <div class="login-wrap">
    <section class="card login-panel">
      <h2>登录 SoloLog</h2>
      <p class="text-muted">
        基础框架内置了 mock 登录流程，便于先行联调页面与路由。
      </p>

      <form
        class="form"
        @submit.prevent="onSubmit"
      >
        <label>
          用户名
          <input
            v-model.trim="form.username"
            required
            placeholder="请输入用户名"
          >
        </label>

        <label>
          密码
          <input
            v-model="form.password"
            required
            type="password"
            placeholder="请输入密码"
          >
        </label>

        <p
          v-if="errorMessage"
          class="error"
        >
          {{ errorMessage }}
        </p>
        <button
          class="btn"
          :disabled="loading"
          type="submit"
        >
          {{ loading ? "登录中..." : "登录" }}
        </button>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { login } from "@/services/modules/auth";
import { useUserStore } from "@/store/modules/user";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const loading = ref(false);
const errorMessage = ref("");

const form = reactive({
  username: "",
  password: "",
});

async function onSubmit() {
  if (loading.value) {
    return;
  }

  loading.value = true;
  errorMessage.value = "";

  try {
    const result = await login(form);
    userStore.setToken(result.token);
    userStore.setUsername(result.username);
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
    router.push(redirect);
  } catch (error) {
    const message = error instanceof Error ? error.message : "登录失败，请重试";
    errorMessage.value = message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 20px;
}

.login-panel {
  width: min(460px, 100%);
  padding: 28px;
}

h2 {
  margin-bottom: 8px;
}

.form {
  margin-top: 16px;
  display: grid;
  gap: 14px;
}

label {
  display: grid;
  gap: 6px;
  font-weight: 600;
}

input {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
}

input:focus {
  outline: 2px solid #bae6fd;
  border-color: #38bdf8;
}

.error {
  color: var(--danger);
}

.btn[disabled] {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
