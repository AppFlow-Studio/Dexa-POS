/**
 * KDSTicketBoard contract: left-to-right flow (ticket i → column i % columns)
 * on one scroll surface, and a front-of-board bump that moves cards WITHOUT
 * re-rendering or remounting them — the 2–4s bump freeze on low-end tablets.
 *
 * Uses react-test-renderer directly (see PanelSheet.test for why).
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { useEffect } from "react";
import { ScrollView, View } from "react-native";
// @ts-ignore — react-test-renderer ships no bundled types on SDK 53
import TestRenderer, { act } from "react-test-renderer";

import KDSTicketBoard from "@/components/kds/KDSTicketBoard";
import type { KDSTicket } from "@/types/kds";

type Renderer = any;
type Instance = any;

const renders = new Map<string, number>();
const mounts = new Map<string, number>();

// The test renderer reports a memo component under its inner function, so
// queries use CardBody while the board renders the memoized Card.
function CardBody({ ticket }: { ticket: KDSTicket }) {
  renders.set(ticket.ticket_id, (renders.get(ticket.ticket_id) ?? 0) + 1);
  useEffect(() => {
    mounts.set(ticket.ticket_id, (mounts.get(ticket.ticket_id) ?? 0) + 1);
  }, [ticket.ticket_id]);
  return <View testID={`card-${ticket.ticket_id}`} />;
}
const Card = React.memo(CardBody);

const renderCard = (t: KDSTicket) => <Card ticket={t} />;

const makeTickets = (n: number, prefix = "t") =>
  Array.from({ length: n }, (_, i) => ({ ticket_id: `${prefix}${i}` }) as KDSTicket);

let rafQueue: FrameRequestCallback[] = [];
beforeEach(() => {
  renders.clear();
  mounts.clear();
  rafQueue = [];
  (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
  };
  (globalThis as any).cancelAnimationFrame = () => {};
});
const flushFrames = () =>
  act(() => {
    const q = rafQueue;
    rafQueue = [];
    q.forEach((cb) => cb(0));
  });

function mountBoard(
  tickets: KDSTicket[],
  opts: { columns?: number; height?: number; namespace?: string } = {},
) {
  const props = {
    columns: opts.columns ?? 3,
    renderCard,
    estimateHeight: () => opts.height ?? 100,
    cacheNamespace: opts.namespace ?? `ns-${Math.random()}`,
    horizontalPadding: 0,
    cellGutter: 0,
    topPadding: 0,
    bottomPadding: 0,
    footerHeight: 0,
  };
  let renderer!: Renderer;
  act(() => {
    renderer = TestRenderer.create(<KDSTicketBoard tickets={tickets} {...props} />);
  });
  const scroll = renderer.root.findByType(ScrollView);
  act(() => {
    scroll.props.onLayout({ nativeEvent: { layout: { width: 900, height: 1000 } } });
  });
  const update = (next: KDSTicket[]) =>
    act(() => renderer.update(<KDSTicketBoard tickets={next} {...props} />));
  return { renderer, scroll, update };
}

/** ticket_id → {left, top} of its absolutely positioned slot. */
function positions(renderer: Renderer) {
  const out: Record<string, { left: number; top: number }> = {};
  for (const card of renderer.root.findAllByType(CardBody)) {
    let node: Instance | null = card.parent;
    while (node && !(node.type === View && node.props.style?.position === "absolute")) {
      node = node.parent;
    }
    const { left, top } = node!.props.style;
    out[card.props.ticket.ticket_id] = { left, top };
  }
  return out;
}

describe("KDSTicketBoard layout", () => {
  it("flows tickets left to right across columns", () => {
    const { renderer } = mountBoard(makeTickets(6));
    expect(positions(renderer)).toEqual({
      t0: { left: 0, top: 0 },
      t1: { left: 300, top: 0 },
      t2: { left: 600, top: 0 },
      t3: { left: 0, top: 100 },
      t4: { left: 300, top: 100 },
      t5: { left: 600, top: 100 },
    });
  });

  it("stacks each column on its measured card heights", () => {
    const tickets = makeTickets(4);
    const { renderer } = mountBoard(tickets);
    // t0's card turns out taller than its estimate.
    const t0Slot = renderer.root
      .findAllByType(View)
      .find((v: Instance) => v.props.onLayout && v.findAllByType(CardBody)[0]?.props.ticket.ticket_id === "t0")!;
    act(() => t0Slot.props.onLayout({ nativeEvent: { layout: { height: 250 } } }));
    flushFrames();
    expect(positions(renderer).t3).toEqual({ left: 0, top: 250 });
  });
});

describe("KDSTicketBoard bump", () => {
  it("bumping the front ticket moves every card without re-rendering or remounting any", () => {
    const tickets = makeTickets(9);
    const { renderer, update } = mountBoard(tickets);
    const rendersBefore = new Map(renders);

    update(tickets.slice(1)); // bump t0

    const after = positions(renderer);
    expect(after.t0).toBeUndefined();
    // Every remaining ticket shifted one slot back in reading order…
    expect(after.t1).toEqual({ left: 0, top: 0 });
    expect(after.t3).toEqual({ left: 600, top: 0 });
    expect(after.t4).toEqual({ left: 0, top: 100 });
    // …yet no card body rendered again and none remounted.
    for (const t of tickets.slice(1)) {
      expect(renders.get(t.ticket_id)).toBe(rendersBefore.get(t.ticket_id));
      expect(mounts.get(t.ticket_id)).toBe(1);
    }
  });

  it("re-renders only the ticket whose data changed", () => {
    const tickets = makeTickets(6);
    const { update } = mountBoard(tickets);
    const rendersBefore = new Map(renders);

    const next = tickets.slice();
    next[2] = { ...tickets[2] } as KDSTicket; // one ticket updated (new object)
    update(next);

    expect(renders.get("t2")).toBe((rendersBefore.get("t2") ?? 0) + 1);
    for (const id of ["t0", "t1", "t3", "t4", "t5"]) {
      expect(renders.get(id)).toBe(rendersBefore.get(id));
    }
  });
});

describe("KDSTicketBoard windowing", () => {
  it("mounts only cards near the viewport and follows the scroll", () => {
    // 1000px cards, 3 columns: rows at 0 / 1000 / 2000 / 3000. The window
    // spans one viewport above to two below, so row 3 starts unmounted.
    const { renderer, scroll } = mountBoard(makeTickets(12), { height: 1000 });
    expect(renderer.root.findAllByType(CardBody)).toHaveLength(9);

    act(() =>
      scroll.props.onScroll({ nativeEvent: { contentOffset: { y: 1500 } } }),
    );
    expect(renderer.root.findAllByType(CardBody)).toHaveLength(12);
  });

  it("keeps measured heights across a remount (tab switch)", () => {
    const tickets = makeTickets(4);
    const namespace = "shared-tab";
    const first = mountBoard(tickets, { namespace });
    const t0Slot = first.renderer.root
      .findAllByType(View)
      .find((v: Instance) => v.props.onLayout && v.findAllByType(CardBody)[0]?.props.ticket.ticket_id === "t0")!;
    act(() => t0Slot.props.onLayout({ nativeEvent: { layout: { height: 180 } } }));
    flushFrames();
    act(() => first.renderer.unmount());

    const second = mountBoard(tickets, { namespace });
    expect(positions(second.renderer).t3).toEqual({ left: 0, top: 180 });
  });
});
