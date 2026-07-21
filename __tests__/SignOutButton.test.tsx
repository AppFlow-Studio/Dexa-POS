import { SignOutButton } from "@/components/auth/SignOutButton";
import { act, fireEvent, render } from "@testing-library/react-native";

const mockSignOut = jest.fn();
const mockResetClientSession = jest.fn();
const mockReplaceRoute = jest.fn();

jest.mock("@clerk/clerk-expo", () => ({
  useClerk: () => ({ signOut: mockSignOut }),
}));

jest.mock("@/services/cacheService", () => ({
  resetClientSession: (...args: unknown[]) => mockResetClientSession(...args),
}));

jest.mock("@/lib/rootNavigation", () => ({
  replaceRoute: (...args: unknown[]) => mockReplaceRoute(...args),
}));

describe("SignOutButton", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockResetClientSession.mockReset();
    mockReplaceRoute.mockReset();
  });

  it("is idempotent while a sign-out is already in flight", async () => {
    let resolveReset: (() => void) | undefined;
    mockResetClientSession.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveReset = resolve;
        }),
    );
    mockSignOut.mockResolvedValue(undefined);

    const { getByText } = render(<SignOutButton />);
    const signOutButton = getByText("Sign Out");

    fireEvent.press(signOutButton);
    fireEvent.press(signOutButton);

    expect(mockResetClientSession).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(0);

    await act(async () => {
      resolveReset?.();
      await Promise.resolve();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplaceRoute).toHaveBeenCalledWith("(auth)", "login");
  });

  it("still routes to login when Clerk signOut fails after local reset", async () => {
    mockResetClientSession.mockResolvedValue(undefined);
    mockSignOut.mockRejectedValue(new Error("offline"));

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { getByText } = render(<SignOutButton />);

    await act(async () => {
      fireEvent.press(getByText("Sign Out"));
    });

    expect(mockResetClientSession).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockReplaceRoute).toHaveBeenCalledWith("(auth)", "login");

    warnSpy.mockRestore();
  });
});
