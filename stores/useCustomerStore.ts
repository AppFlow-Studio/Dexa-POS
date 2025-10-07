import { MOCK_CUSTOMERS } from "@/lib/mockData";
import { create } from "zustand";
export interface Customer {
  id: string;
  name: string;
  phoneNumber: string;
  address?: string; // Optional for pickup orders
  email?: string;
  createdAt: Date;
  lastOrderDate?: Date;
  totalOrders: number;
}

interface CustomerState {
  customers: Customer[];
  addCustomer: (
    customer: Omit<Customer, "id" | "createdAt" | "totalOrders">
  ) => Customer;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  findCustomerByPhone: (phoneNumber: string) => Customer | undefined;
  searchCustomersByPhone: (partialPhone: string) => Customer[];
  getCustomerById: (id: string) => Customer | undefined;
  incrementOrderCount: (customerId: string) => void;
}

export const useCustomerStore = create<CustomerState>()((set, get) => ({
  customers: MOCK_CUSTOMERS,

  addCustomer: (customerData) => {
    const { customers } = get();

    const existingCustomer = customers.find(
      (c) => c.phoneNumber.trim() === customerData.phoneNumber.trim()
    );

    if (existingCustomer) {
      // If a customer with the same phone number exists, throw an error.
      throw new Error(
        `Customer with phone number ${customerData.phoneNumber} already exists.`
      );
    }

    const newCustomer: Customer = {
      ...customerData,
      id: `customer_${Date.now()}`,
      createdAt: new Date(),
      totalOrders: 1,
    };

    set((state) => ({
      customers: [...state.customers, newCustomer],
    }));

    return newCustomer;
  },

  updateCustomer: (id, updates) => {
    set((state) => ({
      customers: state.customers.map((customer) =>
        customer.id === id ? { ...customer, ...updates } : customer
      ),
    }));
  },

  findCustomerByPhone: (phoneNumber) => {
    const { customers } = get();
    return customers.find((customer) => customer.phoneNumber === phoneNumber);
  },

  searchCustomersByPhone: (partialPhone) => {
    const { customers } = get();
    if (partialPhone.length < 3) return [];
    return customers.filter((customer) =>
      customer.phoneNumber.includes(partialPhone)
    );
  },

  getCustomerById: (id) => {
    const { customers } = get();
    return customers.find((customer) => customer.id === id);
  },

  incrementOrderCount: (customerId) => {
    set((state) => ({
      customers: state.customers.map((customer) =>
        customer.id === customerId
          ? {
              ...customer,
              totalOrders: customer.totalOrders + 1,
              lastOrderDate: new Date(),
            }
          : customer
      ),
    }));
  },
}));
