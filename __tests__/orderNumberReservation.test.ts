/**
 * Location-wide numbering: New Order must show the final shared number at
 * once. The provisional #S3-0003 that the server replaced a second later is
 * what this replaces; it is now only the offline fallback.
 */
import { __resetLocalSequencesForTests } from "@/lib/localOrderSequence";
import {
  __resetOrderNumberReservationForTests,
  refillOrderNumberReservation,
} from "@/lib/orderNumberReservation";
import { allocateOrderNumbers } from "@/lib/reusableEmptyDraft";
import { storage } from "@/lib/storage";

const LOCATION = "loc-lw";
const today = (() => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}${m}${day}`;
})();

/** generate_order_number(location, NULL): one shared counter. */
function sharedCounter(start: number) {
  let next = start;
  let online = true;
  const calls: { name: string; params: any }[] = [];
  return {
    calls,
    goOffline: () => {
      online = false;
    },
    client: {
      rpc: async (name: string, params: any) => {
        calls.push({ name, params });
        if (!online) throw new Error("Network request failed");
        const n = String(next++).padStart(4, "0");
        return { data: `ORD-${today}-${n}`, error: null };
      },
    } as any,
  };
}

const allocate = (locationWide = true) =>
  allocateOrderNumbers({
    ordersById: {},
    orderIds: [],
    locationId: LOCATION,
    stationNumber: 3,
    locationWide,
  });

beforeEach(() => {
  __resetOrderNumberReservationForTests();
  __resetLocalSequencesForTests();
});

it("New Order gets the final shared number at once, then the next is reserved", async () => {
  const server = sharedCounter(44);
  await refillOrderNumberReservation(LOCATION, server.client);

  expect(allocate()).toEqual({ orderNumber: `ORD-${today}-0044`, displayNumber: "#0044" });
  await refillOrderNumberReservation(LOCATION); // the refill the take started
  expect(allocate()).toEqual({ orderNumber: `ORD-${today}-0045`, displayNumber: "#0045" });

  expect(server.calls.every((c) => c.name === "generate_order_number")).toBe(true);
  expect(server.calls.every((c) => c.params.p_station_id === null)).toBe(true);
});

it("never hands the same reservation out twice", async () => {
  const server = sharedCounter(44);
  await refillOrderNumberReservation(LOCATION, server.client);

  const first = allocate();
  const second = allocate(); // before the refill lands
  expect(first.displayNumber).toBe("#0044");
  expect(second.displayNumber).toMatch(/^#S3-\d{4}$/); // provisional, server replaces it
});

it("falls back to a provisional station number offline", async () => {
  const server = sharedCounter(44);
  server.goOffline();
  await refillOrderNumberReservation(LOCATION, server.client);

  expect(allocate().displayNumber).toMatch(/^#S3-\d{4}$/);
});

it("drops a reservation from another day or another location", () => {
  storage.set(
    "order_number_reservation",
    JSON.stringify({
      locationId: LOCATION,
      orderNumber: "ORD-20200101-0007",
      displayNumber: "#0007",
      reservedOn: "20200101",
    }),
  );
  expect(allocate().displayNumber).toMatch(/^#S3-/);

  __resetOrderNumberReservationForTests(); // as after a restart
  storage.set(
    "order_number_reservation",
    JSON.stringify({
      locationId: "another-location",
      orderNumber: `ORD-${today}-0007`,
      displayNumber: "#0007",
      reservedOn: today,
    }),
  );
  __resetLocalSequencesForTests();
  expect(allocate().displayNumber).toMatch(/^#S3-/);
});

it("per-station mode leaves the reservation alone", async () => {
  const server = sharedCounter(44);
  await refillOrderNumberReservation(LOCATION, server.client);

  expect(allocate(false).displayNumber).toMatch(/^#S3-\d{4}$/);
  expect(allocate(true).displayNumber).toBe("#0044");
});
