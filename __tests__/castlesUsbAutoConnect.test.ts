// Regression tests for the zero-touch Castles USB auto-connect coordinator.
// Verifies the connect-decision logic: connect on a Castles-VID hotplug when a
// USB Castles terminal is configured and the singleton is idle; otherwise skip.

jest.mock('@/modules/castles-usb', () => ({
  addAttachedListener: jest.fn(),
}));
jest.mock('@/services/terminals/castles-service', () => ({
  getSharedCastlesService: jest.fn(),
}));
jest.mock('@/stores/useStoreSettingsStore', () => ({
  useStoreSettingsStore: { getState: jest.fn() },
}));

import { addAttachedListener } from '@/modules/castles-usb';
import { getSharedCastlesService } from '@/services/terminals/castles-service';
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore';
import {
  startCastlesUsbAutoConnect,
  stopCastlesUsbAutoConnect,
} from '@/services/terminals/castlesUsbAutoConnect';

const CASTLES_VENDOR_ID = 0x0ca6;

type AttachCb = (e: { deviceId: number; vendorId: number; productId: number }) => void;

function setStation(terminal: Record<string, unknown> | null) {
  (useStoreSettingsStore.getState as jest.Mock).mockReturnValue({
    selectedStation: terminal ? { payment_terminal: terminal } : null,
  });
}

function makeService(over: Partial<Record<string, unknown>> = {}) {
  const service = {
    isSuspended: jest.fn().mockReturnValue(false),
    isConnected: jest.fn().mockReturnValue(false),
    connect: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  (getSharedCastlesService as jest.Mock).mockReturnValue(service);
  return service;
}

function captureAttachCb(): AttachCb {
  let cb: AttachCb = () => {};
  (addAttachedListener as jest.Mock).mockImplementation((fn: AttachCb) => {
    cb = fn;
    return { remove: jest.fn() };
  });
  // start subscribes synchronously, capturing the callback
  startCastlesUsbAutoConnect();
  return cb;
}

const USB_CASTLES = {
  id: 't1',
  terminal_type: 'castles',
  connection_type: 'usb',
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  stopCastlesUsbAutoConnect();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('castlesUsbAutoConnect', () => {
  it('connects on a Castles-VID attach when a USB Castles terminal is configured and idle', () => {
    // No terminal at startup so the initial "startup" schedule no-ops and leaves
    // connectInFlight false — keeps the attach assertion fully deterministic
    // without having to flush the startup connect's promise.
    setStation(null);
    const service = makeService();
    const cb = captureAttachCb();
    jest.advanceTimersByTime(750);
    expect(service.connect).not.toHaveBeenCalled();

    // Now a USB Castles terminal is selected and its device is plugged in.
    setStation(USB_CASTLES);
    cb({ deviceId: 5, vendorId: CASTLES_VENDOR_ID, productId: 0x0070 });
    jest.advanceTimersByTime(750);

    expect(service.connect).toHaveBeenCalledTimes(1);
    expect(service.connect).toHaveBeenCalledWith(
      expect.objectContaining({ connectionType: 'usb', terminalId: 't1' }),
    );
  });

  it('ignores attach events from non-Castles vendor ids', () => {
    setStation(USB_CASTLES);
    const service = makeService();
    const cb = captureAttachCb();

    jest.advanceTimersByTime(750);
    service.connect.mockClear();

    cb({ deviceId: 9, vendorId: 0x1234, productId: 0x0001 });
    jest.advanceTimersByTime(750);

    expect(service.connect).not.toHaveBeenCalled();
  });

  it('does not connect when the singleton is already connected', () => {
    setStation(USB_CASTLES);
    const service = makeService({ isConnected: jest.fn().mockReturnValue(true) });
    captureAttachCb();

    jest.advanceTimersByTime(750);

    expect(service.connect).not.toHaveBeenCalled();
  });

  it('does not connect when the service is suspended (app backgrounded)', () => {
    setStation(USB_CASTLES);
    const service = makeService({ isSuspended: jest.fn().mockReturnValue(true) });
    captureAttachCb();

    jest.advanceTimersByTime(750);

    expect(service.connect).not.toHaveBeenCalled();
  });

  it('does not connect when the station terminal is not USB Castles', () => {
    setStation({ id: 't2', terminal_type: 'castles', connection_type: 'local_socket' });
    const service = makeService();
    captureAttachCb();

    jest.advanceTimersByTime(750);

    expect(service.connect).not.toHaveBeenCalled();
  });
});
