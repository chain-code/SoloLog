<template>
  <div class="not-found-wrap">
    <section class="card not-found">
      <h2>404</h2>
      <p class="text-muted">
        页面不存在或已被移除。
      </p>
      <RouterLink
        class="btn"
        to="/"
      >
        返回首页
      </RouterLink>
    </section>
  </div>
</template>

<style scoped>
.not-found-wrap {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 20px;
}

.not-found {
  width: min(420px, 100%);
  text-align: center;
  padding: 28px;
  display: grid;
  gap: 14px;
  justify-items: center;
}

h2 {
  font-size: 42px;
}
</style>
