import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListTable } from "@/components/ui/list-table";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function pullDown(target: Element, distance: number) {
  fireEvent.touchStart(target, { touches: [{ clientY: 40 }] });
  fireEvent.touchMove(target, { touches: [{ clientY: 40 + distance }] });
  fireEvent.touchEnd(target);
}

describe("PullToRefresh", () => {
  afterEach(() => {
    mockMatchMedia(false);
  });

  it("stays inactive on desktop", () => {
    mockMatchMedia(false);
    const onRefresh = vi.fn();

    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <table>
          <tbody>
            <tr>
              <td>列</td>
            </tr>
          </tbody>
        </table>
      </PullToRefresh>,
    );

    const scroller = container.querySelector(".pull-to-refresh");
    expect(scroller).not.toBeNull();
    expect(scroller).not.toHaveAttribute("data-pull-to-refresh");
    pullDown(scroller!, 200);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByText("下拉重新整理")).not.toBeInTheDocument();
  });

  it("refreshes when pulled past the threshold on mobile", () => {
    mockMatchMedia(true);
    const onRefresh = vi.fn();

    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <table>
          <tbody>
            <tr>
              <td>列</td>
            </tr>
          </tbody>
        </table>
      </PullToRefresh>,
    );

    const scroller = container.querySelector(".pull-to-refresh");
    expect(scroller).toHaveAttribute("data-pull-to-refresh");
    expect(screen.getByText("下拉重新整理")).toBeInTheDocument();

    pullDown(scroller!, 200);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("正在重新整理")).toBeInTheDocument();
  });

  it("returns a reversed pull gesture to list scrolling", () => {
    mockMatchMedia(true);
    const onRefresh = vi.fn();

    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div>Scrollable list</div>
      </PullToRefresh>,
    );

    const scroller = container.querySelector<HTMLElement>(".pull-to-refresh")!;
    fireEvent.touchStart(scroller, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(scroller, { touches: [{ clientY: 150 }] });
    expect(scroller).toHaveClass("is-pulling");

    fireEvent.touchMove(scroller, { touches: [{ clientY: 80 }] });
    expect(scroller).not.toHaveClass("is-pulling");
    expect(scroller.scrollTop).toBe(20);
    fireEvent.touchEnd(scroller);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not start pull-to-refresh from a dropdown control", () => {
    mockMatchMedia(true);
    const onRefresh = vi.fn();

    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <select aria-label="Status"><option>Open</option></select>
      </PullToRefresh>,
    );

    pullDown(screen.getByLabelText("Status"), 200);
    expect(container.querySelector(".pull-to-refresh")).not.toHaveClass("is-pulling");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not refresh while the actual outer list scroller is away from the top", () => {
    mockMatchMedia(true);
    const onRefresh = vi.fn();

    const { container } = render(
      <div data-testid="outer-scroller" style={{ overflowY: "auto" }}>
        <PullToRefresh onRefresh={onRefresh}>
          <div>List content</div>
        </PullToRefresh>
      </div>,
    );

    const outerScroller = screen.getByTestId("outer-scroller");
    Object.defineProperty(outerScroller, "scrollHeight", { configurable: true, value: 800 });
    Object.defineProperty(outerScroller, "clientHeight", { configurable: true, value: 300 });
    outerScroller.scrollTop = 120;

    pullDown(container.querySelector(".pull-to-refresh")!, 200);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not capture an upward list scroll when a nested mobile list is away from the top", () => {
    mockMatchMedia(true);
    const onRefresh = vi.fn();

    const { container } = render(
      <PullToRefresh onRefresh={onRefresh}>
        <div data-testid="order-list" style={{ overflowY: "auto" }}>
          <article data-testid="order-card">Order</article>
        </div>
      </PullToRefresh>,
    );

    const orderList = screen.getByTestId("order-list");
    Object.defineProperty(orderList, "scrollHeight", { configurable: true, value: 800 });
    Object.defineProperty(orderList, "clientHeight", { configurable: true, value: 300 });
    orderList.scrollTop = 120;

    const orderCard = screen.getByTestId("order-card");
    fireEvent.touchStart(orderCard, { touches: [{ clientY: 40 }] });
    const moveEvent = createEvent.touchMove(orderCard, {
      cancelable: true,
      touches: [{ clientY: 240 }],
    });
    fireEvent(orderCard, moveEvent);
    fireEvent.touchEnd(orderCard);

    expect(moveEvent.defaultPrevented).toBe(false);
    expect(container.querySelector(".pull-to-refresh")).not.toHaveClass("is-pulling");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("is built into ListTable so every operational table can refresh", () => {
    mockMatchMedia(true);
    const onRefresh = vi.fn();

    const { container } = render(
      <ListTable
        loading={false}
        loadingLabel="正在載入"
        skeletonColumns={2}
        onRefresh={onRefresh}
        header={
          <tr>
            <th>名稱</th>
          </tr>
        }
      >
        <tr>
          <td>資料</td>
        </tr>
      </ListTable>,
    );

    const scroller = container.querySelector(".operational-table-wrap");
    expect(scroller).toHaveAttribute("data-pull-to-refresh");
    pullDown(scroller!, 200);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
