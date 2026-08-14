import { fireEvent, render, screen } from "@testing-library/react";
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
