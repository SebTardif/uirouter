import { describe, expect, it } from "vitest";
import { createRouter, type RouteLocation, type RouterHistory } from "../src/index";

type RouteId = "a" | "b";
type HistoryOperation = {
  type: "push" | "replace";
  location: RouteLocation;
};
type MemoryHistory = RouterHistory & {
  operations: HistoryOperation[];
  emit: (location: RouteLocation) => void;
};

function location(pathname: string, search = "", hash = ""): RouteLocation {
  return { pathname, search, hash };
}

function createMemoryHistory(initial: RouteLocation): MemoryHistory {
  let current = initial;
  const listeners = new Set<(location: RouteLocation) => void>();
  const operations: HistoryOperation[] = [];
  return {
    operations,
    location: () => current,
    push(nextLocation) {
      current = nextLocation;
      operations.push({ type: "push", location: nextLocation });
    },
    replace(nextLocation) {
      current = nextLocation;
      operations.push({ type: "replace", location: nextLocation });
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(nextLocation) {
      current = nextLocation;
      for (const listener of listeners) {
        listener(nextLocation);
      }
    },
  };
}

function createPendingDestination() {
  let finishLoader!: () => void;
  const loaderGate = new Promise<void>((resolve) => {
    finishLoader = resolve;
  });
  let finishComponent!: () => void;
  const componentGate = new Promise<void>((resolve) => {
    finishComponent = resolve;
  });
  const router = createRouter<RouteId, string, string, string>({
    routes: [
      {
        id: "a",
        path: "/a",
        component: () => "view-a",
        loader: () => "data-a",
      },
      {
        id: "b",
        path: "/b",
        component: () => componentGate.then(() => "view-b"),
        loader: () => loaderGate.then(() => "data-b"),
      },
    ],
  });
  const history = createMemoryHistory(location("/a"));
  return { router, history, finishLoader, finishComponent };
}

function expectDestinationB(
  history: MemoryHistory,
  router: ReturnType<typeof createPendingDestination>["router"],
): void {
  expect(history.location().pathname).toBe("/b");
  expect(router.getState().location.pathname).toBe("/b");
  expect(router.getState().matches[0]?.routeId).toBe("b");
  expect(router.getState().status).toBe("success");
  expect(router.getState().matches[0]?.data).toBe("data-b");
}

describe("invalidate during a pending navigation", () => {
  it("lets the pending route finish when invalidate is called without a route id", async () => {
    const { router, history, finishLoader, finishComponent } = createPendingDestination();
    await router.start(history, "", "ctx");
    const navigation = router.navigate("b", "ctx", { history: "push" });

    await router.invalidate();
    finishComponent();
    finishLoader();
    await navigation;

    expectDestinationB(history, router);
    router.stop();
  });

  it("lets the pending route finish when revalidate is called without a route id", async () => {
    const { router, history, finishLoader, finishComponent } = createPendingDestination();
    await router.start(history, "", "ctx");
    const navigation = router.navigate("b", "ctx", { history: "push" });

    await router.revalidate("ctx");
    finishComponent();
    finishLoader();
    await navigation;

    expectDestinationB(history, router);
    router.stop();
  });
});
