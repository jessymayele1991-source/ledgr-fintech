import type { NextRequest } from "next/server";

const mockCreateServerClient = jest.fn();
const mockCookies = jest.fn();
const mockCookieStore = {
  getAll: jest.fn(),
  set: jest.fn(),
};
const mockGetUser = jest.fn();
const mockUpsert = jest.fn();

jest.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

jest.mock("next/headers", () => ({
  cookies: () => mockCookies(),
}));

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

import { createSupabaseServerClient, getCurrentUser } from "@/lib/utils/auth";

describe("server auth helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    mockCookies.mockReturnValue(mockCookieStore);
    mockCreateServerClient.mockReturnValue({
      auth: {
        getUser: mockGetUser,
      },
    });
  });

  test("reads Supabase cookies from the current API request", async () => {
    const requestCookies = [{ name: "sb-test-auth-token", value: "token" }];
    const request = {
      cookies: {
        getAll: jest.fn(() => requestCookies),
      },
    } as unknown as NextRequest;

    await createSupabaseServerClient(request);

    const cookieAdapter = mockCreateServerClient.mock.calls[0][2].cookies;
    expect(cookieAdapter.getAll()).toBe(requestCookies);
    expect(mockCookieStore.getAll).not.toHaveBeenCalled();
  });

  test("persists refreshed Supabase cookies from route handlers", async () => {
    await createSupabaseServerClient();

    const cookieAdapter = mockCreateServerClient.mock.calls[0][2].cookies;
    cookieAdapter.setAll([
      {
        name: "sb-test-auth-token",
        value: "new-token",
        options: { path: "/", httpOnly: true },
      },
    ]);

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "sb-test-auth-token",
      "new-token",
      { path: "/", httpOnly: true }
    );
  });

  test("upserts and returns the app user for a verified Supabase user", async () => {
    const dbUser = {
      id: "app-user-id",
      supabaseId: "auth-user-id",
      email: "user@example.com",
      name: "Test User",
    };
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "auth-user-id",
          email: "user@example.com",
          user_metadata: { name: "Test User" },
        },
      },
      error: null,
    });
    mockUpsert.mockResolvedValue(dbUser);

    await expect(getCurrentUser()).resolves.toBe(dbUser);

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { supabaseId: "auth-user-id" },
      update: {
        email: "user@example.com",
        name: "Test User",
      },
      create: {
        supabaseId: "auth-user-id",
        email: "user@example.com",
        name: "Test User",
      },
    });
  });
});
