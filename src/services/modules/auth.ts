import http from "@/services/http";
import type { ApiResponse } from "@/types/api";

export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
  username: string;
}

export async function login(params: LoginParams): Promise<LoginResult> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "true") {
    return mockLogin(params);
  }

  const { data } = await http.post<ApiResponse<LoginResult>>("/auth/login", params);
  if (data.code !== 0 || !data.data) {
    throw new Error(data.message || "登录失败");
  }
  return data.data;
}

async function mockLogin(params: LoginParams): Promise<LoginResult> {
  await new Promise((resolve) => {
    window.setTimeout(resolve, 300);
  });

  return {
    token: `mock-token-${Date.now()}`,
    username: params.username,
  };
}
