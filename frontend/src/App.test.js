import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("./services/api", () => ({
  __esModule: true,
  AUTH_STORAGE_KEY: "hunter_auth_state",
  registerLogoutHandler: jest.fn(),
  default: {
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import App from "./App";

describe("App", () => {
  let container;
  let root;

  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, "", "/login");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the login screen for unauthenticated users", () => {
    act(() => {
      root.render(<App />);
    });

    expect(container.textContent).toContain("Secure Access");
    expect(container.textContent).toContain("Sign in");
    expect(container.textContent).toContain("HUNTER");
  });
});
