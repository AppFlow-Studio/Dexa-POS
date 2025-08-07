import { AddOn, Discount, ItemSize, MenuItemType, Order } from "./types";

export const MOCK_ORDERS: Order[] = [
  {
    id: "45654",
    customerName: "Jake Carter",
    status: "Ready",
    type: "Dine In",
    table: 2,
    time: "2m ago",
  },
  {
    id: "45675",
    customerName: "Emma Brooks",
    status: "Preparing",
    type: "Dine In",
    table: 5,
    time: "2m ago",
  },
  {
    id: "89123",
    customerName: "Liam Smith",
    status: "Preparing",
    type: "Take Away",
    table: 0,
    time: "5m ago",
  },
  {
    id: "45629",
    customerName: "Mason Reed",
    status: "Ready",
    type: "Dine In",
    table: 3,
    time: "8m ago",
  },
  {
    id: "73456",
    customerName: "Olivia Chen",
    status: "Ready",
    type: "Delivery",
    table: 0,
    time: "10m ago",
  },
  {
    id: "94567",
    customerName: "Sophia Roy",
    status: "Preparing",
    type: "Take Away",
    table: 0,
    time: "12m ago",
  },
  {
    id: "12389",
    customerName: "Noah Kim",
    status: "Ready",
    type: "Dine In",
    table: 1,
    time: "15m ago",
  },
  {
    id: "56790",
    customerName: "Ava Jones",
    status: "Ready",
    type: "Delivery",
    table: 0,
    time: "18m ago",
  },
];

export const MENU_IMAGE_MAP = {
  "classic_burger.png": require("../assets/images/classic_burger.png"),
  "bbq_bacon_burger.png": require("../assets/images/bbq_bacon_burger.png"),
  "vegan_wrap.png": require("../assets/images/vegan_wrap.png"),
  "margherita_pizza.png": require("../assets/images/margherita_pizza.png"),
  "chicken_caesar_salad.png": require("../assets/images/chicken_caesar_salad.png"),
  "french_fries.png": require("../assets/images/french_fries.png"),
  "onion_rings.png": require("../assets/images/onion_rings.png"),
  "coke.png": require("../assets/images/coke.png"),
  "sprite.png": require("../assets/images/sprite.png"),
  "chocolate_cake.png": require("../assets/images/chocolate_cake.png"),
  "cheesecake.png": require("../assets/images/cheesecake.png"),
  "pancakes.png": require("../assets/images/pancakes.png"),
  "eggs_benedict.png": require("../assets/images/eggs_benedict.png"),
};

const fifteenPercentOff: Discount = {
  id: "promo1",
  label: "15% Off",
  value: 0.15,
  type: "percentage",
};
const tenPercentOff: Discount = {
  id: "promo2",
  label: "10% Off",
  value: 0.1,
  type: "percentage",
};

const standardSizes: ItemSize[] = [
  { id: "size_reg", name: "Regular", priceModifier: 0.0 },
  { id: "size_lg", name: "Large", priceModifier: 2.0 },
];
const burgerAddOns: AddOn[] = [
  { id: "addon_onion", name: "Extra onions", price: 1.0 },
  { id: "addon_cheese", name: "Extra Cheese", price: 1.5 },
  { id: "addon_egg", name: "Extra Fried Egg", price: 2.0 },
];

export const MOCK_MENU_ITEMS: MenuItemType[] = [
  // --- Main Course ---
  {
    id: "1",
    name: "Classic Burger",
    description:
      "Features with two juicy chicken patties, melted cheese, crisp lettuce, fresh tomatoes, etc. Perfect for those who crave a hearty, flavorful bite!",
    price: 9.99,
    image: "classic_burger.png",
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    sizes: standardSizes,
    addOns: burgerAddOns,
  },
  {
    id: "2",
    name: "BBQ Bacon Burger",
    price: 12.99,
    image: "bbq_bacon_burger.png",
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    availableDiscount: fifteenPercentOff,
  },
  {
    id: "3",
    name: "Vegan Wrap",
    price: 8.99,
    image: "vegan_wrap.png",
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
  },
  {
    id: "4",
    name: "Margherita Pizza",
    price: 14.5,
    image: "margherita_pizza.png",
    meal: ["Dinner", "Specials"],
    category: "Main Course",
  },
  // --- Appetizers ---
  {
    id: "5",
    name: "Chicken Caesar Salad",
    price: 7.5,
    image: "chicken_caesar_salad.png",
    meal: ["Lunch", "Dinner"],
    category: "Appetizers",
  },
  // --- Sides ---
  {
    id: "6",
    name: "French Fries",
    price: 3.99,
    image: "french_fries.png",
    meal: ["Lunch", "Dinner", "Brunch"],
    category: "Sides",
  },
  {
    id: "7",
    name: "Onion Rings",
    price: 4.99,
    image: "onion_rings.png",
    meal: ["Lunch", "Dinner"],
    category: "Sides",
  },
  // --- Drinks ---
  {
    id: "8",
    name: "Coca-Cola",
    price: 1.99,
    image: "coke.png",
    meal: ["Lunch", "Dinner", "Brunch", "Specials"],
    category: "Drinks",
  },
  {
    id: "9",
    name: "Sprite",
    price: 1.99,
    image: "sprite.png",
    meal: ["Lunch", "Dinner", "Brunch", "Specials"],
    category: "Drinks",
  },
  // --- Desserts ---
  {
    id: "10",
    name: "Chocolate Lava Cake",
    price: 6.99,
    image: "chocolate_cake.png",
    meal: ["Dinner"],
    category: "Dessert",
  },
  {
    id: "11",
    name: "New York Cheesecake",
    price: 7.25,
    image: "cheesecake.png",
    meal: ["Dinner"],
    category: "Dessert",
  },
  // --- Brunch ---
  {
    id: "12",
    name: "Fluffy Pancakes",
    price: 8.5,
    image: "pancakes.png",
    meal: ["Brunch", "Specials"],
    category: "Main Course",
    availableDiscount: tenPercentOff,
  },
  {
    id: "13",
    name: "Eggs Benedict",
    price: 10.5,
    image: "eggs_benedict.png",
    meal: ["Brunch"],
    category: "Main Course",
  },
];
