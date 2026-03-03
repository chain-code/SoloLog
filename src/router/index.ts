import { createRouter, createWebHistory } from "vue-router";
import AppLayout from "@/components/layout/AppLayout.vue";
import HomePage from "@/pages/home/HomePage.vue";
import NotFoundPage from "@/pages/not-found/NotFoundPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: AppLayout,
      children: [
        {
          path: "",
          name: "home",
          component: HomePage,
        },
      ],
    },
    {
      path: "/login",
      redirect: { name: "home" },
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: NotFoundPage,
    },
  ],
});

export default router;
