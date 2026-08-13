import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveIsSingleLocation } from "@/lib/menu/singleLocationScope";

type QueryResponse = {
  data: { id: string }[] | null;
  error: Error | null;
};

function createLocationsQuery(response: QueryResponse) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
    then: (
      resolve: (value: QueryResponse) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(response).then(resolve, reject),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  return query;
}

function createClient({
  isAdmin,
  accessibleLocationIds = [],
  activeLocationIds,
  adminError = null,
}: {
  isAdmin: boolean;
  accessibleLocationIds?: string[];
  activeLocationIds: string[];
  adminError?: Error | null;
}) {
  const locationsQuery = createLocationsQuery({
    data: activeLocationIds.map((id) => ({ id })),
    error: null,
  });
  const rpc = jest.fn(async (name: string) => {
    if (name === "is_merchant_admin") {
      return { data: isAdmin, error: adminError };
    }
    if (name === "get_user_accessible_locations") {
      return {
        data: accessibleLocationIds.map((location_id) => ({ location_id })),
        error: null,
      };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  const from = jest.fn(() => locationsQuery);

  return {
    client: { rpc, from } as unknown as SupabaseClient,
    from,
    locationsQuery,
    rpc,
  };
}

describe("resolveIsSingleLocation", () => {
  it("counts all active merchant locations for an admin", async () => {
    const { client, locationsQuery, rpc } = createClient({
      isAdmin: true,
      activeLocationIds: ["location-1"],
    });

    await expect(
      resolveIsSingleLocation(client, "user-1", "merchant-1"),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(locationsQuery.eq).toHaveBeenCalledWith(
      "merchant_id",
      "merchant-1",
    );
    expect(locationsQuery.eq).toHaveBeenCalledWith("is_active", true);
    expect(locationsQuery.in).not.toHaveBeenCalled();
  });

  it("does not misclassify an admin with multiple active locations", async () => {
    const { client } = createClient({
      isAdmin: true,
      activeLocationIds: ["location-1", "location-2"],
    });

    await expect(
      resolveIsSingleLocation(client, "user-1", "merchant-1"),
    ).resolves.toBe(false);
  });

  it("counts only active locations accessible to non-admin staff", async () => {
    const { client, locationsQuery, rpc } = createClient({
      isAdmin: false,
      accessibleLocationIds: ["location-1", "location-1"],
      activeLocationIds: ["location-1"],
    });

    await expect(
      resolveIsSingleLocation(client, "user-1", "merchant-1"),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("get_user_accessible_locations", {
      p_user_id: "user-1",
    });
    expect(locationsQuery.in).toHaveBeenCalledWith("id", ["location-1"]);
  });

  it("fails closed when non-admin staff have no accessible locations", async () => {
    const { client, from } = createClient({
      isAdmin: false,
      activeLocationIds: [],
    });

    await expect(
      resolveIsSingleLocation(client, "user-1", "merchant-1"),
    ).resolves.toBe(false);
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("propagates resolver errors instead of enabling core editing", async () => {
    const error = new Error("admin check failed");
    const { client, from } = createClient({
      isAdmin: false,
      activeLocationIds: [],
      adminError: error,
    });

    await expect(
      resolveIsSingleLocation(client, "user-1", "merchant-1"),
    ).rejects.toBe(error);
    expect(from).not.toHaveBeenCalled();
  });
});
