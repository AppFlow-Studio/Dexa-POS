import CashierStand from "@/components/tables/svg/CashierStand";
import TableSquare2Chair from "@/components/tables/svg/TableSquare2Chair";
import TableSquare4Chair from "@/components/tables/svg/TableSquare4Chair";
import TableSquare8Chair from "@/components/tables/svg/TableSquare8Chair";
import { Customer } from "@/stores/useCustomerStore";
import {
  AddOn,
  CartItem,
  Check,
  Discount,
  DrawerSummary,
  EmployeeShift,
  InventoryItem,
  ItemSize,
  MenuItemType,
  ModifierCategory,
  OfflineOrder,
  OnlineOrder,
  Order,
  PaymentTerminal,
  PreviousOrder,
  PrinterDevice,
  PrinterRule,
  ShiftHistoryEntry,
  ShiftStatus,
  TableType,
  TrackedOrder,
  UserProfile,
  Vendor,
} from "./types";

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
    type: "Takeaway",
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
    type: "Takeaway",
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
  // New menu item images
  // "pepperoni_supreme_pizza.png": require("../assets/images/pepperoni_supreme_pizza.png"),
  // "mediterranean_quinoa_bowl.png": require("../assets/images/mediterranean_quinoa_bowl.png"),
  // "club_sandwich.png": require("../assets/images/club_sandwich.png"),
  // "alfredo_pasta.png": require("../assets/images/alfredo_pasta.png"),
  // "buffalo_wings.png": require("../assets/images/buffalo_wings.png"),
  // "loaded_nachos.png": require("../assets/images/loaded_nachos.png"),
  // "tomato_basil_soup.png": require("../assets/images/tomato_basil_soup.png"),
  // "chicken_noodle_soup.png": require("../assets/images/chicken_noodle_soup.png"),
  // "fresh_coffee.png": require("../assets/images/fresh_coffee.png"),
  // "tropical_smoothie.png": require("../assets/images/tropical_smoothie.png"),
  // "orange_juice.png": require("../assets/images/orange_juice.png"),
  // "belgian_waffles.png": require("../assets/images/belgian_waffles.png"),
  // "avocado_toast.png": require("../assets/images/avocado_toast.png"),
  // "tiramisu.png": require("../assets/images/tiramisu.png"),
  // "chocolate_chip_cookies.png": require("../assets/images/chocolate_chip_cookies.png"),
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

// --- Custom Add-Ons (Category-Specific) ---
const wrapAddOns: AddOn[] = [
  { id: "wrap1", name: "Extra Avocado", price: 1.0 },
  { id: "wrap2", name: "Gluten-Free Wrap", price: 1.5 },
  { id: "wrap3", name: "Spicy Mayo", price: 0.5 },
];

const pizzaAddOns: AddOn[] = [
  { id: "pizza1", name: "Extra Cheese", price: 1.5 },
  { id: "pizza2", name: "Pepperoni", price: 2.0 },
  { id: "pizza3", name: "Mushrooms", price: 1.0 },
];

const saladAddOns: AddOn[] = [
  { id: "salad1", name: "Grilled Chicken", price: 2.0 },
  { id: "salad2", name: "Parmesan", price: 0.75 },
  { id: "salad3", name: "Croutons", price: 0.5 },
];

const sidesAddOns: AddOn[] = [
  { id: "side1", name: "Garlic Aioli", price: 0.5 },
  { id: "side2", name: "Cheese Sauce", price: 0.75 },
  { id: "side3", name: "Truffle Oil Drizzle", price: 1.0 },
];

// --- Detailed Modifiers for Burgers ---
const burgerModifiers: ModifierCategory[] = [
  {
    id: "burger_size",
    name: "Burger Size",
    type: "required",
    selectionType: "single",
    options: [
      { id: "single", name: "Single", price: 0 },
      { id: "double", name: "Double", price: 2.0 },
    ],
  },
  {
    id: "burger_patty",
    name: "Patty",
    type: "required",
    selectionType: "single",
    options: [
      { id: "beef", name: "Beef", price: 0 },
      { id: "turkey", name: "Turkey", price: 0.5 },
      { id: "veggie", name: "Veggie", price: 0.5 },
    ],
  },
  {
    id: "burger-cheese",
    name: "Burgher Cheese",
    type: "optional",
    selectionType: "single",
    options: [
      { id: "cheddar", name: "Cheddar", price: 0.75 },
      { id: "american", name: "American", price: 0.75 },
      { id: "swiss", name: "Swiss", price: 0.75 },
      { id: "no_cheese", name: "No Cheese", price: 0 },
    ],
  },
  {
    id: "burger-toppings",
    name: "Burger Toppings",
    type: "optional",
    selectionType: "multiple",
    maxSelections: 3,
    description: "Included up to 3; extras +$0.25 each",
    options: [
      { id: "lettuce", name: "Lettuce", price: 0 },
      { id: "tomato", name: "Tomato", price: 0 },
      { id: "onion", name: "Onion", price: 0 },
      { id: "pickles", name: "Pickles", price: 0 },
      { id: "jalapenos", name: "Jalapeños", price: 0 },
      { id: "bacon", name: "Bacon", price: 1.0 },
    ],
  },
  {
    id: "sauces",
    name: "Sauces",
    type: "optional",
    selectionType: "multiple",
    maxSelections: 2,
    description: "Choose up to 2",
    options: [
      { id: "ketchup", name: "Ketchup", price: 0 },
      { id: "mayo", name: "Mayo", price: 0 },
      { id: "bbq", name: "BBQ", price: 0 },
      { id: "secret", name: "Secret Sauce", price: 0 },
    ],
  },
  {
    id: "bun",
    name: "Bun",
    type: "required",
    selectionType: "single",
    options: [
      { id: "sesame", name: "Sesame", price: 0 },
      { id: "brioche", name: "Brioche", price: 0.5, isAvailable: false }, // 86'd
      { id: "gluten_free", name: "Gluten-free", price: 1.0 },
    ],
  },
  {
    id: "prep",
    name: "Prep",
    type: "optional",
    selectionType: "single",
    options: [
      { id: "rare", name: "Rare", price: 0 },
      { id: "medium", name: "Medium", price: 0 },
      { id: "well_done", name: "Well-done", price: 0 },
    ],
  },
];

const drinksAddOns: AddOn[] = [
  { id: "drink1", name: "Lemon Slice", price: 0.25 },
  { id: "drink2", name: "Extra Ice", price: 0.0 },
  { id: "drink3", name: "Flavor Shot (Vanilla)", price: 0.5 },
];

const dessertAddOns: AddOn[] = [
  { id: "dessert1", name: "Vanilla Ice Cream Scoop", price: 1.5 },
  { id: "dessert2", name: "Chocolate Syrup", price: 0.5 },
  { id: "dessert3", name: "Strawberries", price: 1.0 },
];

const brunchAddOns: AddOn[] = [
  { id: "brunch1", name: "Maple Syrup", price: 0.5 },
  { id: "brunch2", name: "Fresh Berries", price: 1.5 },
  { id: "brunch3", name: "Whipped Cream", price: 0.75 },
];

// --- Additional Modifier Categories for New Items ---
const pizzaModifiers: ModifierCategory[] = [
  {
    id: "pizza_size",
    name: "Pizza Size",
    type: "required",
    selectionType: "single",
    options: [
      { id: "small", name: 'Small (10")', price: 0 },
      { id: "medium", name: 'Medium (12")', price: 3.0 },
      { id: "large", name: 'Large (14")', price: 5.0 },
    ],
  },
  {
    id: "pizza_crust",
    name: "Crust",
    type: "required",
    selectionType: "single",
    options: [
      { id: "thin", name: "Thin Crust", price: 0 },
      { id: "regular", name: "Regular", price: 0 },
      { id: "thick", name: "Thick Crust", price: 1.0 },
      { id: "gluten_free", name: "Gluten-Free", price: 2.0 },
    ],
  },
  {
    id: "toppings",
    name: "Extra Toppings",
    type: "optional",
    selectionType: "multiple",
    maxSelections: 5,
    description: "First 2 free, then $1.50 each",
    options: [
      { id: "pepperoni", name: "Pepperoni", price: 1.5 },
      { id: "sausage", name: "Italian Sausage", price: 1.5 },
      { id: "mushrooms", name: "Mushrooms", price: 1.5 },
      { id: "olives", name: "Black Olives", price: 1.5 },
      { id: "peppers", name: "Bell Peppers", price: 1.5 },
      { id: "onions", name: "Red Onions", price: 1.5 },
      { id: "pineapple", name: "Pineapple", price: 1.5 },
      { id: "bacon", name: "Bacon", price: 2.0 },
    ],
  },
];

const saladModifiers: ModifierCategory[] = [
  {
    id: "dressing",
    name: "Dressing",
    type: "required",
    selectionType: "single",
    options: [
      { id: "caesar", name: "Caesar", price: 0 },
      { id: "ranch", name: "Ranch", price: 0 },
      { id: "balsamic", name: "Balsamic Vinaigrette", price: 0 },
      { id: "italian", name: "Italian", price: 0 },
      { id: "honey_mustard", name: "Honey Mustard", price: 0 },
      { id: "no_dressing", name: "No Dressing", price: 0 },
    ],
  },
  {
    id: "salad_protein",
    name: "Salad Protein",
    type: "optional",
    selectionType: "single",
    options: [
      { id: "grilled_chicken", name: "Grilled Chicken", price: 3.0 },
      { id: "crispy_chicken", name: "Crispy Chicken", price: 3.5 },
      { id: "salmon", name: "Grilled Salmon", price: 5.0 },
      { id: "shrimp", name: "Grilled Shrimp", price: 4.0 },
      { id: "steak", name: "Sliced Steak", price: 4.5 },
      { id: "tofu", name: "Grilled Tofu", price: 2.5 },
    ],
  },
  {
    id: "extras",
    name: "Extra Toppings",
    type: "optional",
    selectionType: "multiple",
    maxSelections: 4,
    description: "First 2 included, extras $0.75 each",
    options: [
      { id: "avocado", name: "Avocado", price: 0.75 },
      { id: "cheese", name: "Extra Cheese", price: 0.75 },
      { id: "croutons", name: "Croutons", price: 0.75 },
      { id: "nuts", name: "Candied Nuts", price: 1.0 },
      { id: "cranberries", name: "Dried Cranberries", price: 0.75 },
    ],
  },
];

const sandwichModifiers: ModifierCategory[] = [
  {
    id: "bread",
    name: "Bread",
    type: "required",
    selectionType: "single",
    options: [
      { id: "white", name: "White", price: 0 },
      { id: "wheat", name: "Wheat", price: 0 },
      { id: "sourdough", name: "Sourdough", price: 0.5 },
      { id: "ciabatta", name: "Ciabatta", price: 0.5 },
      { id: "gluten_free", name: "Gluten-Free", price: 1.0 },
    ],
  },
  {
    id: "sandwich_protein",
    name: "Sandwich Protein",
    type: "required",
    selectionType: "single",
    options: [
      { id: "turkey", name: "Turkey", price: 0 },
      { id: "ham", name: "Ham", price: 0 },
      { id: "roast_beef", name: "Roast Beef", price: 1.0 },
      { id: "chicken", name: "Grilled Chicken", price: 1.0 },
      { id: "tuna", name: "Tuna Salad", price: 0.5 },
    ],
  },
  {
    id: "sandwich_cheese",
    name: "Cheese",
    type: "optional",
    selectionType: "single",
    options: [
      { id: "swiss", name: "Swiss", price: 0.75 },
      { id: "cheddar", name: "Cheddar", price: 0.75 },
      { id: "provolone", name: "Provolone", price: 0.75 },
      { id: "no_cheese", name: "No Cheese", price: 0 },
    ],
  },
  {
    id: "veggies",
    name: "Vegetables",
    type: "optional",
    selectionType: "multiple",
    maxSelections: 5,
    description: "All included",
    options: [
      { id: "lettuce", name: "Lettuce", price: 0 },
      { id: "tomato", name: "Tomato", price: 0 },
      { id: "onion", name: "Onion", price: 0 },
      { id: "cucumber", name: "Cucumber", price: 0 },
      { id: "peppers", name: "Bell Peppers", price: 0 },
    ],
  },
];

const pastaModifiers: ModifierCategory[] = [
  {
    id: "pasta_type",
    name: "Pasta Type",
    type: "required",
    selectionType: "single",
    options: [
      { id: "spaghetti", name: "Spaghetti", price: 0 },
      { id: "penne", name: "Penne", price: 0 },
      { id: "fettuccine", name: "Fettuccine", price: 0 },
      { id: "linguine", name: "Linguine", price: 0 },
      { id: "gluten_free", name: "Gluten-Free Pasta", price: 2.0 },
    ],
  },
  {
    id: "pasta_protein",
    name: "Pasta Protein",
    type: "optional",
    selectionType: "single",
    options: [
      { id: "chicken", name: "Grilled Chicken", price: 3.0 },
      { id: "shrimp", name: "Shrimp", price: 4.0 },
      { id: "meatballs", name: "Meatballs", price: 2.5 },
      { id: "sausage", name: "Italian Sausage", price: 2.5 },
    ],
  },
  {
    id: "spice_level",
    name: "Spice Level",
    type: "optional",
    selectionType: "single",
    options: [
      { id: "mild", name: "Mild", price: 0 },
      { id: "medium", name: "Medium", price: 0 },
      { id: "spicy", name: "Spicy", price: 0 },
      { id: "extra_spicy", name: "Extra Spicy", price: 0 },
    ],
  },
];

const soupModifiers: ModifierCategory[] = [
  {
    id: "soup_size",
    name: "Soup Size",
    type: "required",
    selectionType: "single",
    options: [
      { id: "cup", name: "Cup", price: 0 },
      { id: "bowl", name: "Bowl", price: 2.0 },
    ],
  },
  {
    id: "soup_bread",
    name: "Bread",
    type: "optional",
    selectionType: "single",
    options: [
      { id: "dinner_roll", name: "Dinner Roll", price: 1.0 },
      { id: "garlic_bread", name: "Garlic Bread", price: 1.5 },
      { id: "crackers", name: "Crackers", price: 0.5 },
      { id: "no_bread", name: "No Bread", price: 0 },
    ],
  },
];

const coffeeModifiers: ModifierCategory[] = [
  {
    id: "coffee_size",
    name: "Coffee Size",
    type: "required",
    selectionType: "single",
    options: [
      { id: "small", name: "Small (8oz)", price: 0 },
      { id: "medium", name: "Medium (12oz)", price: 0.5 },
      { id: "large", name: "Large (16oz)", price: 1.0 },
    ],
  },
  {
    id: "milk",
    name: "Milk",
    type: "optional",
    selectionType: "single",
    options: [
      { id: "whole", name: "Whole Milk", price: 0 },
      { id: "skim", name: "Skim Milk", price: 0 },
      { id: "oat", name: "Oat Milk", price: 0.5 },
      { id: "almond", name: "Almond Milk", price: 0.5 },
      { id: "soy", name: "Soy Milk", price: 0.5 },
      { id: "no_milk", name: "No Milk", price: 0 },
    ],
  },
  {
    id: "flavors",
    name: "Flavors",
    type: "optional",
    selectionType: "multiple",
    maxSelections: 2,
    description: "First flavor free, second +$0.50",
    options: [
      { id: "vanilla", name: "Vanilla", price: 0 },
      { id: "caramel", name: "Caramel", price: 0.5 },
      { id: "hazelnut", name: "Hazelnut", price: 0.5 },
      { id: "cinnamon", name: "Cinnamon", price: 0.5 },
    ],
  },
];

// --- Additional Add-Ons for New Categories ---
const pastaAddOns: AddOn[] = [
  { id: "pasta1", name: "Extra Parmesan", price: 0.75 },
  { id: "pasta2", name: "Red Pepper Flakes", price: 0.25 },
  { id: "pasta3", name: "Garlic Bread", price: 2.0 },
];

const soupAddOns: AddOn[] = [
  { id: "soup1", name: "Extra Crackers", price: 0.5 },
  { id: "soup2", name: "Side Salad", price: 3.0 },
  { id: "soup3", name: "Extra Bread", price: 1.0 },
];

const sandwichAddOns: AddOn[] = [
  { id: "sandwich1", name: "Extra Mayo", price: 0.25 },
  { id: "sandwich2", name: "Mustard", price: 0.25 },
  { id: "sandwich3", name: "Side Pickles", price: 0.5 },
];

const coffeeAddOns: AddOn[] = [
  { id: "coffee1", name: "Extra Shot", price: 0.75 },
  { id: "coffee2", name: "Whipped Cream", price: 0.5 },
  { id: "coffee3", name: "Extra Hot", price: 0.0 },
];

const smoothieAddOns: AddOn[] = [
  { id: "smoothie1", name: "Protein Powder", price: 1.5 },
  { id: "smoothie2", name: "Extra Fruit", price: 1.0 },
  { id: "smoothie3", name: "Honey", price: 0.5 },
];

const breakfastAddOns: AddOn[] = [
  { id: "breakfast1", name: "Extra Butter", price: 0.25 },
  { id: "breakfast2", name: "Side Bacon", price: 2.0 },
  { id: "breakfast3", name: "Fresh Fruit", price: 1.5 },
];

// --- Additional Modifier Categories for Expanded Menu ---
const steakModifiers: ModifierCategory[] = [
  {
    id: "cut",
    name: "Cut",
    type: "required",
    selectionType: "single",
    options: [
      { id: "ribeye", name: "Ribeye", price: 0 },
      { id: "sirloin", name: "Sirloin", price: -2.0 },
      { id: "filet", name: "Filet Mignon", price: 5.0 },
      { id: "strip", name: "New York Strip", price: 2.0 },
    ],
  },
  {
    id: "cooking_temp",
    name: "Cooking Temperature",
    type: "required",
    selectionType: "single",
    options: [
      { id: "rare", name: "Rare", price: 0 },
      { id: "medium_rare", name: "Medium Rare", price: 0 },
      { id: "medium", name: "Medium", price: 0 },
      { id: "medium_well", name: "Medium Well", price: 0 },
      { id: "well_done", name: "Well Done", price: 0 },
    ],
  },
  {
    id: "sides",
    name: "Sides",
    type: "optional",
    selectionType: "multiple",
    maxSelections: 2,
    description: "Choose up to 2 sides",
    options: [
      { id: "mashed_potatoes", name: "Mashed Potatoes", price: 0 },
      { id: "baked_potato", name: "Baked Potato", price: 0 },
      { id: "french_fries", name: "French Fries", price: 0 },
      { id: "steamed_broccoli", name: "Steamed Broccoli", price: 0 },
      { id: "grilled_asparagus", name: "Grilled Asparagus", price: 1.0 },
    ],
  },
];

const seafoodModifiers: ModifierCategory[] = [
  {
    id: "preparation",
    name: "Preparation",
    type: "required",
    selectionType: "single",
    options: [
      { id: "grilled", name: "Grilled", price: 0 },
      { id: "pan_seared", name: "Pan Seared", price: 0 },
      { id: "blackened", name: "Blackened", price: 1.0 },
      { id: "crispy", name: "Crispy", price: 2.0 },
    ],
  },
  {
    id: "sauce",
    name: "Sauce",
    type: "optional",
    selectionType: "single",
    options: [
      { id: "lemon_butter", name: "Lemon Butter", price: 0 },
      { id: "tartar", name: "Tartar Sauce", price: 0 },
      { id: "cocktail", name: "Cocktail Sauce", price: 0 },
      { id: "remoulade", name: "Remoulade", price: 0.5 },
      { id: "no_sauce", name: "No Sauce", price: 0 },
    ],
  },
];

const tacoModifiers: ModifierCategory[] = [
  {
    id: "shell",
    name: "Shell",
    type: "required",
    selectionType: "single",
    options: [
      { id: "soft", name: "Soft Tortilla", price: 0 },
      { id: "hard", name: "Hard Shell", price: 0 },
      { id: "crispy", name: "Crispy Corn", price: 0.5 },
      { id: "lettuce_wrap", name: "Lettuce Wrap", price: 0 },
    ],
  },
  {
    id: "taco-protein",
    name: "Taco Protein",
    type: "required",
    selectionType: "single",
    options: [
      { id: "ground_beef", name: "Ground Beef", price: 0 },
      { id: "chicken", name: "Grilled Chicken", price: 0 },
      { id: "carnitas", name: "Carnitas", price: 1.0 },
      { id: "fish", name: "Grilled Fish", price: 2.0 },
      { id: "veggie", name: "Veggie", price: -1.0 },
    ],
  },
  {
    id: "taco-toppings",
    name: "Taco Toppings",
    type: "optional",
    selectionType: "multiple",
    maxSelections: 4,
    description: "All included",
    options: [
      { id: "lettuce", name: "Lettuce", price: 0 },
      { id: "tomato", name: "Tomato", price: 0 },
      { id: "onion", name: "Onion", price: 0 },
      { id: "cheese", name: "Cheese", price: 0 },
      { id: "sour_cream", name: "Sour Cream", price: 0 },
      { id: "guacamole", name: "Guacamole", price: 1.0 },
    ],
  },
];

const ramenModifiers: ModifierCategory[] = [
  {
    id: "broth",
    name: "Broth",
    type: "required",
    selectionType: "single",
    options: [
      { id: "tonkotsu", name: "Tonkotsu", price: 0 },
      { id: "miso", name: "Miso", price: 0 },
      { id: "shoyu", name: "Shoyu", price: 0 },
      { id: "vegetable", name: "Vegetable", price: 0 },
    ],
  },
  {
    id: "noodles",
    name: "Noodles",
    type: "required",
    selectionType: "single",
    options: [
      { id: "thin", name: "Thin Noodles", price: 0 },
      { id: "thick", name: "Thick Noodles", price: 0 },
      { id: "udon", name: "Udon Noodles", price: 1.0 },
    ],
  },
  {
    id: "ramen-toppings",
    name: "Ramen Toppings",
    type: "optional",
    selectionType: "multiple",
    maxSelections: 3,
    description: "First 2 included, extras $1.50 each",
    options: [
      { id: "egg", name: "Soft Boiled Egg", price: 1.5 },
      { id: "pork_belly", name: "Pork Belly", price: 2.0 },
      { id: "seaweed", name: "Seaweed", price: 1.5 },
      { id: "corn", name: "Corn", price: 1.5 },
      { id: "bamboo", name: "Bamboo Shoots", price: 1.5 },
    ],
  },
];

const sushiModifiers: ModifierCategory[] = [
  {
    id: "rice",
    name: "Rice",
    type: "required",
    selectionType: "single",
    options: [
      { id: "white", name: "White Rice", price: 0 },
      { id: "brown", name: "Brown Rice", price: 0.5 },
      { id: "no_rice", name: "No Rice (Sashimi)", price: 0 },
    ],
  },
  {
    id: "wasabi",
    name: "Wasabi",
    type: "optional",
    selectionType: "single",
    options: [
      { id: "regular", name: "Regular", price: 0 },
      { id: "extra", name: "Extra", price: 0.5 },
      { id: "none", name: "None", price: 0 },
    ],
  },
];

const iceCreamModifiers: ModifierCategory[] = [
  {
    id: "ice-cream-size",
    name: "Ice Cream Size",
    type: "required",
    selectionType: "single",
    options: [
      { id: "single", name: "Single Scoop", price: 0 },
      { id: "double", name: "Double Scoop", price: 2.0 },
      { id: "triple", name: "Triple Scoop", price: 4.0 },
    ],
  },
  {
    id: "flavor",
    name: "Flavor",
    type: "required",
    selectionType: "single",
    options: [
      { id: "vanilla", name: "Vanilla", price: 0 },
      { id: "chocolate", name: "Chocolate", price: 0 },
      { id: "strawberry", name: "Strawberry", price: 0 },
      { id: "mint_chip", name: "Mint Chip", price: 0.5 },
      { id: "cookies_cream", name: "Cookies & Cream", price: 0.5 },
    ],
  },
  {
    id: "ice-cream-toppings",
    name: "Ice Cream Toppings",
    type: "optional",
    selectionType: "multiple",
    maxSelections: 3,
    description: "First topping free, extras $0.75 each",
    options: [
      { id: "sprinkles", name: "Sprinkles", price: 0 },
      { id: "nuts", name: "Chopped Nuts", price: 0.75 },
      { id: "cherry", name: "Cherry", price: 0.75 },
      { id: "whipped_cream", name: "Whipped Cream", price: 0.75 },
    ],
  },
];

// --- Additional Add-Ons for Expanded Categories ---
const steakAddOns: AddOn[] = [
  { id: "steak1", name: "Mushroom Sauce", price: 2.0 },
  { id: "steak2", name: "Peppercorn Sauce", price: 2.0 },
  { id: "steak3", name: "Garlic Butter", price: 1.0 },
];

const seafoodAddOns: AddOn[] = [
  { id: "seafood1", name: "Extra Lemon", price: 0.25 },
  { id: "seafood2", name: "Side Rice", price: 2.0 },
  { id: "seafood3", name: "Coleslaw", price: 1.5 },
];

const tacoAddOns: AddOn[] = [
  { id: "taco1", name: "Extra Salsa", price: 0.5 },
  { id: "taco2", name: "Side Chips", price: 1.5 },
  { id: "taco3", name: "Refried Beans", price: 1.0 },
];

const ramenAddOns: AddOn[] = [
  { id: "ramen1", name: "Extra Noodles", price: 2.0 },
  { id: "ramen2", name: "Side Gyoza", price: 3.0 },
  { id: "ramen3", name: "Extra Broth", price: 1.0 },
];

const sushiAddOns: AddOn[] = [
  { id: "sushi1", name: "Extra Ginger", price: 0.25 },
  { id: "sushi2", name: "Soy Sauce", price: 0.0 },
  { id: "sushi3", name: "Side Miso Soup", price: 2.0 },
];

const iceCreamAddOns: AddOn[] = [
  { id: "icecream1", name: "Waffle Cone", price: 1.0 },
  { id: "icecream2", name: "Chocolate Dip", price: 1.5 },
  { id: "icecream3", name: "Extra Hot Fudge", price: 1.0 },
];

const teaAddOns: AddOn[] = [
  { id: "tea1", name: "Honey", price: 0.5 },
  { id: "tea2", name: "Lemon Slice", price: 0.25 },
  { id: "tea3", name: "Extra Hot Water", price: 0.0 },
];

const energyDrinkAddOns: AddOn[] = [
  { id: "energy1", name: "Extra Ice", price: 0.0 },
  { id: "energy2", name: "Energy Shot", price: 2.0 },
  { id: "energy3", name: "Vitamin Boost", price: 1.5 },
];

// --- Exportable Array of All Modifier Groups ---
export const ALL_MODIFIER_GROUPS: ModifierCategory[] = [
  // Burger Modifiers
  ...burgerModifiers,

  // Pizza Modifiers
  ...pizzaModifiers,

  // Salad Modifiers
  ...saladModifiers,

  // Sandwich Modifiers
  ...sandwichModifiers,

  // Pasta Modifiers
  ...pastaModifiers,

  // Soup Modifiers
  ...soupModifiers,

  // Coffee Modifiers
  ...coffeeModifiers,

  // Steak Modifiers
  ...steakModifiers,

  // Seafood Modifiers
  ...seafoodModifiers,

  // Taco Modifiers
  ...tacoModifiers,

  // Ramen Modifiers
  ...ramenModifiers,

  // Sushi Modifiers
  ...sushiModifiers,

  // Ice Cream Modifiers
  ...iceCreamModifiers,
].map((group) => {
  if (group?.type === "required" && Array.isArray(group.options)) {
    const hasDefault = group.options.some((o: any) => o?.isDefault);
    // Ensure exactly one default when none is present:
    if (!hasDefault && group.options.length > 0) {
      return {
        ...group,
        options: group.options.map((opt: any, idx: number) => ({
          ...opt,
          isDefault: idx === 0,
        })),
      } as ModifierCategory;
    }
  }
  return group;
});

export const MOCK_VENDORS: Vendor[] = [
  {
    id: "vendor_1",
    name: "Sysco Foods",
    contactPerson: "John Smith",
    email: "john.smith@sysco.com",
    phone: "123-456-7890",
  },
  {
    id: "vendor_2",
    name: "Restaurant Depot",
    contactPerson: "Jane Doe",
    email: "jane.doe@restaurantdepot.com",
    phone: "098-765-4321",
  },
  {
    id: "vendor_3",
    name: "Local Produce Market",
    contactPerson: "Mike Johnson",
    email: "mike@localproduce.com",
    phone: "555-123-4567",
  },
  {
    id: "vendor_4",
    name: "Ocean Seafood Co.",
    contactPerson: "Sarah Wilson",
    email: "sarah@oceanseafood.com",
    phone: "555-987-6543",
  },
];

export const MOCK_INVENTORY_ITEMS: InventoryItem[] = [
  {
    id: "inv_1",
    name: "Beef Patty",
    category: "Meat",
    stockQuantity: 150,
    unit: "pcs",
    reorderThreshold: 50,
    cost: 1.25,
    vendorId: "vendor_1",
  },
  {
    id: "inv_2",
    name: "Burger Bun",
    category: "Bakery",
    stockQuantity: 200,
    unit: "pcs",
    reorderThreshold: 75,
    cost: 0.3,
    vendorId: "vendor_1",
  },
  {
    id: "inv_3",
    name: "Cheddar Cheese Slice",
    category: "Dairy",
    stockQuantity: 500,
    unit: "pcs",
    reorderThreshold: 100,
    cost: 0.15,
    vendorId: "vendor_2",
  },
  {
    id: "inv_4",
    name: "Bacon Strip",
    category: "Meat",
    stockQuantity: 300,
    unit: "pcs",
    reorderThreshold: 100,
    cost: 0.35,
    vendorId: "vendor_1",
  },
  {
    id: "inv_5",
    name: "BBQ Sauce",
    category: "Condiments",
    stockQuantity: 20,
    unit: "bottle",
    reorderThreshold: 5,
    cost: 2.5,
    vendorId: "vendor_2",
  },
  {
    id: "inv_6",
    name: "Tortilla Wrap",
    category: "Bakery",
    stockQuantity: 150,
    unit: "pcs",
    reorderThreshold: 50,
    cost: 0.25,
    vendorId: "vendor_1",
  },
  {
    id: "inv_7",
    name: "Hummus",
    category: "Condiments",
    stockQuantity: 15,
    unit: "bottle",
    reorderThreshold: 5,
    cost: 3.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_8",
    name: "Fresh Vegetables Mix",
    category: "Produce",
    stockQuantity: 50,
    unit: "lbs",
    reorderThreshold: 20,
    cost: 1.5,
    vendorId: "vendor_3",
  },
  {
    id: "inv_9",
    name: "Pizza Dough",
    category: "Bakery",
    stockQuantity: 100,
    unit: "pcs",
    reorderThreshold: 30,
    cost: 1.0,
    vendorId: "vendor_1",
  },
  {
    id: "inv_10",
    name: "Tomato Sauce",
    category: "Condiments",
    stockQuantity: 25,
    unit: "bottle",
    reorderThreshold: 10,
    cost: 2.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_11",
    name: "Mozzarella Cheese",
    category: "Dairy",
    stockQuantity: 40,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 4.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_12",
    name: "Fresh Basil",
    category: "Produce",
    stockQuantity: 10,
    unit: "bag",
    reorderThreshold: 4,
    cost: 1.0,
    vendorId: "vendor_3",
  },
  {
    id: "inv_13",
    name: "Romaine Lettuce",
    category: "Produce",
    stockQuantity: 30,
    unit: "pcs",
    reorderThreshold: 10,
    cost: 1.2,
    vendorId: "vendor_3",
  },
  {
    id: "inv_14",
    name: "Chicken Breast",
    category: "Meat",
    stockQuantity: 80,
    unit: "lbs",
    reorderThreshold: 25,
    cost: 3.5,
    vendorId: "vendor_1",
  },
  {
    id: "inv_15",
    name: "Caesar Dressing",
    category: "Condiments",
    stockQuantity: 15,
    unit: "bottle",
    reorderThreshold: 5,
    cost: 2.8,
    vendorId: "vendor_2",
  },
  {
    id: "inv_16",
    name: "Croutons",
    category: "Bakery",
    stockQuantity: 20,
    unit: "bag",
    reorderThreshold: 8,
    cost: 1.5,
    vendorId: "vendor_1",
  },
  {
    id: "inv_17",
    name: "Parmesan Cheese",
    category: "Dairy",
    stockQuantity: 15,
    unit: "lbs",
    reorderThreshold: 5,
    cost: 5.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_18",
    name: "Potatoes",
    category: "Produce",
    stockQuantity: 100,
    unit: "lbs",
    reorderThreshold: 30,
    cost: 0.5,
    vendorId: "vendor_3",
  },
  {
    id: "inv_19",
    name: "Onions",
    category: "Produce",
    stockQuantity: 50,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 0.4,
    vendorId: "vendor_3",
  },
  {
    id: "inv_20",
    name: "Coca-Cola Syrup",
    category: "Beverages",
    stockQuantity: 10,
    unit: "bottle",
    reorderThreshold: 3,
    cost: 15.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_21",
    name: "Sprite Syrup",
    category: "Beverages",
    stockQuantity: 10,
    unit: "bottle",
    reorderThreshold: 3,
    cost: 15.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_22",
    name: "Chocolate Cake Mix",
    category: "Bakery",
    stockQuantity: 20,
    unit: "bag",
    reorderThreshold: 8,
    cost: 2.5,
    vendorId: "vendor_1",
  },
  {
    id: "inv_23",
    name: "Cheesecake Base",
    category: "Dairy",
    stockQuantity: 15,
    unit: "pcs",
    reorderThreshold: 5,
    cost: 3.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_24",
    name: "Pancake Mix",
    category: "Bakery",
    stockQuantity: 25,
    unit: "bag",
    reorderThreshold: 10,
    cost: 2.0,
    vendorId: "vendor_1",
  },
  {
    id: "inv_25",
    name: "Maple Syrup",
    category: "Condiments",
    stockQuantity: 12,
    unit: "bottle",
    reorderThreshold: 4,
    cost: 4.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_26",
    name: "Eggs",
    category: "Dairy",
    stockQuantity: 240,
    unit: "pcs",
    reorderThreshold: 60,
    cost: 0.15,
    vendorId: "vendor_3",
  },
  {
    id: "inv_27",
    name: "Canadian Bacon",
    category: "Meat",
    stockQuantity: 40,
    unit: "lbs",
    reorderThreshold: 12,
    cost: 4.5,
    vendorId: "vendor_1",
  },
  {
    id: "inv_28",
    name: "English Muffin",
    category: "Bakery",
    stockQuantity: 100,
    unit: "pcs",
    reorderThreshold: 30,
    cost: 0.4,
    vendorId: "vendor_1",
  },
  {
    id: "inv_29",
    name: "Hollandaise Sauce",
    category: "Condiments",
    stockQuantity: 8,
    unit: "bottle",
    reorderThreshold: 3,
    cost: 3.5,
    vendorId: "vendor_2",
  },
  {
    id: "inv_30",
    name: "Pepperoni",
    category: "Meat",
    stockQuantity: 45,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 3.8,
    vendorId: "vendor_1",
  },
  {
    id: "inv_31",
    name: "Pasta",
    category: "Dry Goods",
    stockQuantity: 50,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 1.2,
    vendorId: "vendor_1",
  },
  {
    id: "inv_32",
    name: "Alfredo Sauce",
    category: "Condiments",
    stockQuantity: 25,
    unit: "bottle",
    reorderThreshold: 8,
    cost: 2.8,
    vendorId: "vendor_2",
  },
  {
    id: "inv_33",
    name: "Chicken Wings",
    category: "Meat",
    stockQuantity: 80,
    unit: "lbs",
    reorderThreshold: 25,
    cost: 2.5,
    vendorId: "vendor_1",
  },
  {
    id: "inv_34",
    name: "Buffalo Sauce",
    category: "Condiments",
    stockQuantity: 15,
    unit: "bottle",
    reorderThreshold: 5,
    cost: 2.2,
    vendorId: "vendor_2",
  },
  {
    id: "inv_35",
    name: "Blue Cheese",
    category: "Dairy",
    stockQuantity: 20,
    unit: "lbs",
    reorderThreshold: 7,
    cost: 4.5,
    vendorId: "vendor_2",
  },
  {
    id: "inv_36",
    name: "Tortilla Chips",
    category: "Snacks",
    stockQuantity: 30,
    unit: "bag",
    reorderThreshold: 10,
    cost: 1.8,
    vendorId: "vendor_1",
  },
  {
    id: "inv_37",
    name: "Jalapeños",
    category: "Produce",
    stockQuantity: 15,
    unit: "lbs",
    reorderThreshold: 5,
    cost: 1.5,
    vendorId: "vendor_3",
  },
  {
    id: "inv_38",
    name: "Sour Cream",
    category: "Dairy",
    stockQuantity: 20,
    unit: "bottle",
    reorderThreshold: 7,
    cost: 1.8,
    vendorId: "vendor_2",
  },
  {
    id: "inv_39",
    name: "Guacamole",
    category: "Condiments",
    stockQuantity: 15,
    unit: "bottle",
    reorderThreshold: 5,
    cost: 3.2,
    vendorId: "vendor_2",
  },
  {
    id: "inv_40",
    name: "Tomato Soup Base",
    category: "Canned Goods",
    stockQuantity: 20,
    unit: "bottle",
    reorderThreshold: 8,
    cost: 1.5,
    vendorId: "vendor_1",
  },
  {
    id: "inv_41",
    name: "Chicken Broth",
    category: "Canned Goods",
    stockQuantity: 25,
    unit: "qt",
    reorderThreshold: 10,
    cost: 1.2,
    vendorId: "vendor_1",
  },
  {
    id: "inv_42",
    name: "Egg Noodles",
    category: "Dry Goods",
    stockQuantity: 30,
    unit: "lbs",
    reorderThreshold: 12,
    cost: 1.4,
    vendorId: "vendor_1",
  },
  {
    id: "inv_43",
    name: "Coffee Beans",
    category: "Beverages",
    stockQuantity: 40,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 5.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_44",
    name: "Water",
    category: "Beverages",
    stockQuantity: 100,
    unit: "qt",
    reorderThreshold: 30,
    cost: 0.1,
    vendorId: "vendor_1",
  },
  {
    id: "inv_45",
    name: "Mango",
    category: "Produce",
    stockQuantity: 25,
    unit: "lbs",
    reorderThreshold: 10,
    cost: 1.8,
    vendorId: "vendor_3",
  },
  {
    id: "inv_46",
    name: "Pineapple",
    category: "Produce",
    stockQuantity: 20,
    unit: "lbs",
    reorderThreshold: 8,
    cost: 1.6,
    vendorId: "vendor_3",
  },
  {
    id: "inv_47",
    name: "Banana",
    category: "Produce",
    stockQuantity: 35,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 0.6,
    vendorId: "vendor_3",
  },
  {
    id: "inv_48",
    name: "Coconut Milk",
    category: "Dairy",
    stockQuantity: 18,
    unit: "bottle",
    reorderThreshold: 7,
    cost: 1.4,
    vendorId: "vendor_2",
  },
  {
    id: "inv_49",
    name: "Oranges",
    category: "Produce",
    stockQuantity: 40,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 0.8,
    vendorId: "vendor_3",
  },
  {
    id: "inv_50",
    name: "Waffle Mix",
    category: "Bakery",
    stockQuantity: 25,
    unit: "lbs",
    reorderThreshold: 10,
    cost: 1.5,
    vendorId: "vendor_1",
  },
  {
    id: "inv_51",
    name: "Butter",
    category: "Dairy",
    stockQuantity: 30,
    unit: "lbs",
    reorderThreshold: 12,
    cost: 2.5,
    vendorId: "vendor_2",
  },
  {
    id: "inv_52",
    name: "Artisan Bread",
    category: "Bakery",
    stockQuantity: 40,
    unit: "pcs",
    reorderThreshold: 15,
    cost: 2.0,
    vendorId: "vendor_1",
  },
  {
    id: "inv_53",
    name: "Avocado",
    category: "Produce",
    stockQuantity: 30,
    unit: "pcs",
    reorderThreshold: 12,
    cost: 0.8,
    vendorId: "vendor_3",
  },
  {
    id: "inv_54",
    name: "Cherry Tomatoes",
    category: "Produce",
    stockQuantity: 20,
    unit: "pcs",
    reorderThreshold: 8,
    cost: 1.5,
    vendorId: "vendor_3",
  },
  {
    id: "inv_55",
    name: "Feta Cheese",
    category: "Dairy",
    stockQuantity: 18,
    unit: "lbs",
    reorderThreshold: 7,
    cost: 3.8,
    vendorId: "vendor_2",
  },
  {
    id: "inv_56",
    name: "Balsamic Glaze",
    category: "Condiments",
    stockQuantity: 12,
    unit: "bottle",
    reorderThreshold: 5,
    cost: 2.8,
    vendorId: "vendor_2",
  },
  {
    id: "inv_57",
    name: "Ladyfingers",
    category: "Bakery",
    stockQuantity: 15,
    unit: "pcs",
    reorderThreshold: 6,
    cost: 2.2,
    vendorId: "vendor_1",
  },
  {
    id: "inv_58",
    name: "Mascarpone Cheese",
    category: "Dairy",
    stockQuantity: 12,
    unit: "lbs",
    reorderThreshold: 5,
    cost: 4.5,
    vendorId: "vendor_2",
  },
  {
    id: "inv_59",
    name: "Cocoa Powder",
    category: "Bakery",
    stockQuantity: 10,
    unit: "lbs",
    reorderThreshold: 4,
    cost: 3.0,
    vendorId: "vendor_1",
  },
  {
    id: "inv_60",
    name: "Cookie Dough",
    category: "Bakery",
    stockQuantity: 20,
    unit: "lbs",
    reorderThreshold: 8,
    cost: 2.2,
    vendorId: "vendor_1",
  },
  {
    id: "inv_61",
    name: "Chocolate Chips",
    category: "Bakery",
    stockQuantity: 15,
    unit: "lbs",
    reorderThreshold: 6,
    cost: 2.5,
    vendorId: "vendor_1",
  },
  {
    id: "inv_62",
    name: "Ribeye Steak",
    category: "Meat",
    stockQuantity: 45,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 8.5,
    vendorId: "vendor_1",
  },
  {
    id: "inv_63",
    name: "Steak Seasoning",
    category: "Spices",
    stockQuantity: 8,
    unit: "bottle",
    reorderThreshold: 3,
    cost: 2.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_64",
    name: "Herb Butter",
    category: "Dairy",
    stockQuantity: 12,
    unit: "lbs",
    reorderThreshold: 5,
    cost: 3.2,
    vendorId: "vendor_2",
  },
  {
    id: "inv_65",
    name: "Salmon Fillet",
    category: "Seafood",
    stockQuantity: 35,
    unit: "lbs",
    reorderThreshold: 12,
    cost: 7.0,
    vendorId: "vendor_4",
  },
  {
    id: "inv_66",
    name: "Lemon",
    category: "Produce",
    stockQuantity: 40,
    unit: "pcs",
    reorderThreshold: 15,
    cost: 0.3,
    vendorId: "vendor_3",
  },
  {
    id: "inv_67",
    name: "Fresh Herbs",
    category: "Produce",
    stockQuantity: 10,
    unit: "bag",
    reorderThreshold: 4,
    cost: 1.0,
    vendorId: "vendor_3",
  },
  {
    id: "inv_68",
    name: "White Fish Fillet",
    category: "Seafood",
    stockQuantity: 30,
    unit: "lbs",
    reorderThreshold: 10,
    cost: 5.5,
    vendorId: "vendor_4",
  },
  {
    id: "inv_69",
    name: "Taco Shells",
    category: "Bakery",
    stockQuantity: 200,
    unit: "pcs",
    reorderThreshold: 60,
    cost: 0.15,
    vendorId: "vendor_1",
  },
  {
    id: "inv_70",
    name: "Cabbage Slaw",
    category: "Produce",
    stockQuantity: 25,
    unit: "lbs",
    reorderThreshold: 10,
    cost: 1.2,
    vendorId: "vendor_3",
  },
  {
    id: "inv_71",
    name: "Chipotle Aioli",
    category: "Condiments",
    stockQuantity: 12,
    unit: "bottle",
    reorderThreshold: 5,
    cost: 2.5,
    vendorId: "vendor_2",
  },
  {
    id: "inv_72",
    name: "Pico de Gallo",
    category: "Condiments",
    stockQuantity: 15,
    unit: "bottle",
    reorderThreshold: 6,
    cost: 2.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_73",
    name: "Avocado Crema",
    category: "Condiments",
    stockQuantity: 12,
    unit: "bottle",
    reorderThreshold: 5,
    cost: 2.8,
    vendorId: "vendor_2",
  },
  {
    id: "inv_74",
    name: "Ramen Noodles",
    category: "Dry Goods",
    stockQuantity: 40,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 1.6,
    vendorId: "vendor_1",
  },
  {
    id: "inv_75",
    name: "Pork Broth",
    category: "Canned Goods",
    stockQuantity: 20,
    unit: "qt",
    reorderThreshold: 8,
    cost: 1.8,
    vendorId: "vendor_1",
  },
  {
    id: "inv_76",
    name: "Chashu Pork",
    category: "Meat",
    stockQuantity: 25,
    unit: "lbs",
    reorderThreshold: 10,
    cost: 4.2,
    vendorId: "vendor_1",
  },
  {
    id: "inv_77",
    name: "Green Onions",
    category: "Produce",
    stockQuantity: 15,
    unit: "bag",
    reorderThreshold: 6,
    cost: 0.8,
    vendorId: "vendor_3",
  },
  {
    id: "inv_78",
    name: "Miso Broth",
    category: "Canned Goods",
    stockQuantity: 18,
    unit: "qt",
    reorderThreshold: 7,
    cost: 1.7,
    vendorId: "vendor_1",
  },
  {
    id: "inv_79",
    name: "Tofu",
    category: "Produce",
    stockQuantity: 20,
    unit: "lbs",
    reorderThreshold: 8,
    cost: 1.5,
    vendorId: "vendor_3",
  },
  {
    id: "inv_80",
    name: "Corn",
    category: "Canned Goods",
    stockQuantity: 15,
    unit: "bottle",
    reorderThreshold: 6,
    cost: 0.9,
    vendorId: "vendor_1",
  },
  {
    id: "inv_81",
    name: "Bamboo Shoots",
    category: "Canned Goods",
    stockQuantity: 12,
    unit: "bottle",
    reorderThreshold: 5,
    cost: 1.2,
    vendorId: "vendor_1",
  },
  {
    id: "inv_82",
    name: "Sushi Rice",
    category: "Dry Goods",
    stockQuantity: 50,
    unit: "lbs",
    reorderThreshold: 20,
    cost: 1.4,
    vendorId: "vendor_1",
  },
  {
    id: "inv_83",
    name: "Nori Sheets",
    category: "Dry Goods",
    stockQuantity: 100,
    unit: "pcs",
    reorderThreshold: 30,
    cost: 0.1,
    vendorId: "vendor_1",
  },
  {
    id: "inv_84",
    name: "Imitation Crab",
    category: "Seafood",
    stockQuantity: 25,
    unit: "lbs",
    reorderThreshold: 10,
    cost: 3.5,
    vendorId: "vendor_4",
  },
  {
    id: "inv_85",
    name: "Cucumber",
    category: "Produce",
    stockQuantity: 30,
    unit: "pcs",
    reorderThreshold: 12,
    cost: 0.4,
    vendorId: "vendor_3",
  },
  {
    id: "inv_86",
    name: "Tuna",
    category: "Seafood",
    stockQuantity: 35,
    unit: "lbs",
    reorderThreshold: 12,
    cost: 6.0,
    vendorId: "vendor_4",
  },
  {
    id: "inv_87",
    name: "Spicy Mayo",
    category: "Condiments",
    stockQuantity: 10,
    unit: "bottle",
    reorderThreshold: 4,
    cost: 2.2,
    vendorId: "vendor_2",
  },
  {
    id: "inv_88",
    name: "Steamed Rice",
    category: "Dry Goods",
    stockQuantity: 100,
    unit: "lbs",
    reorderThreshold: 30,
    cost: 0.8,
    vendorId: "vendor_1",
  },
  {
    id: "inv_89",
    name: "Teriyaki Sauce",
    category: "Condiments",
    stockQuantity: 15,
    unit: "bottle",
    reorderThreshold: 6,
    cost: 2.3,
    vendorId: "vendor_2",
  },
  {
    id: "inv_90",
    name: "Beef Strips",
    category: "Meat",
    stockQuantity: 40,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 5.5,
    vendorId: "vendor_1",
  },
  {
    id: "inv_91",
    name: "Stir Fry Sauce",
    category: "Condiments",
    stockQuantity: 12,
    unit: "bottle",
    reorderThreshold: 5,
    cost: 2.4,
    vendorId: "vendor_2",
  },
  {
    id: "inv_92",
    name: "Quinoa",
    category: "Dry Goods",
    stockQuantity: 30,
    unit: "lbs",
    reorderThreshold: 12,
    cost: 2.0,
    vendorId: "vendor_1",
  },
  {
    id: "inv_93",
    name: "Chickpeas",
    category: "Canned Goods",
    stockQuantity: 20,
    unit: "bottle",
    reorderThreshold: 8,
    cost: 0.9,
    vendorId: "vendor_1",
  },
  {
    id: "inv_94",
    name: "Tahini Dressing",
    category: "Condiments",
    stockQuantity: 10,
    unit: "bottle",
    reorderThreshold: 4,
    cost: 2.6,
    vendorId: "vendor_2",
  },
  {
    id: "inv_95",
    name: "Pulled Pork",
    category: "Meat",
    stockQuantity: 35,
    unit: "lbs",
    reorderThreshold: 12,
    cost: 4.0,
    vendorId: "vendor_1",
  },
  {
    id: "inv_96",
    name: "Brioche Bun",
    category: "Bakery",
    stockQuantity: 120,
    unit: "pcs",
    reorderThreshold: 40,
    cost: 0.4,
    vendorId: "vendor_1",
  },
  {
    id: "inv_97",
    name: "Coleslaw",
    category: "Produce",
    stockQuantity: 20,
    unit: "lbs",
    reorderThreshold: 8,
    cost: 1.5,
    vendorId: "vendor_3",
  },
  {
    id: "inv_98",
    name: "Mozzarella Sticks",
    category: "Frozen",
    stockQuantity: 200,
    unit: "pcs",
    reorderThreshold: 60,
    cost: 0.2,
    vendorId: "vendor_1",
  },
  {
    id: "inv_99",
    name: "Marinara Sauce",
    category: "Condiments",
    stockQuantity: 18,
    unit: "bottle",
    reorderThreshold: 7,
    cost: 1.8,
    vendorId: "vendor_2",
  },
  {
    id: "inv_100",
    name: "Spinach Artichoke Dip",
    category: "Frozen",
    stockQuantity: 15,
    unit: "bottle",
    reorderThreshold: 6,
    cost: 3.0,
    vendorId: "vendor_1",
  },
  {
    id: "inv_101",
    name: "Flour Tortilla",
    category: "Bakery",
    stockQuantity: 150,
    unit: "pcs",
    reorderThreshold: 50,
    cost: 0.15,
    vendorId: "vendor_1",
  },
  {
    id: "inv_102",
    name: "Calamari Rings",
    category: "Frozen",
    stockQuantity: 25,
    unit: "lbs",
    reorderThreshold: 10,
    cost: 4.5,
    vendorId: "vendor_4",
  },
  {
    id: "inv_103",
    name: "Lemon Aioli",
    category: "Condiments",
    stockQuantity: 10,
    unit: "bottle",
    reorderThreshold: 4,
    cost: 2.3,
    vendorId: "vendor_2",
  },
  {
    id: "inv_104",
    name: "Button Mushrooms",
    category: "Produce",
    stockQuantity: 20,
    unit: "lbs",
    reorderThreshold: 8,
    cost: 2.0,
    vendorId: "vendor_3",
  },
  {
    id: "inv_105",
    name: "Herbed Cream Cheese",
    category: "Dairy",
    stockQuantity: 15,
    unit: "lbs",
    reorderThreshold: 6,
    cost: 3.2,
    vendorId: "vendor_2",
  },
  {
    id: "inv_106",
    name: "Breadcrumbs",
    category: "Bakery",
    stockQuantity: 12,
    unit: "lbs",
    reorderThreshold: 5,
    cost: 1.2,
    vendorId: "vendor_1",
  },
  {
    id: "inv_107",
    name: "Sweet Potatoes",
    category: "Produce",
    stockQuantity: 35,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 0.7,
    vendorId: "vendor_3",
  },
  {
    id: "inv_108",
    name: "Macaroni",
    category: "Dry Goods",
    stockQuantity: 40,
    unit: "lbs",
    reorderThreshold: 15,
    cost: 1.1,
    vendorId: "vendor_1",
  },
  {
    id: "inv_109",
    name: "Cheese Sauce",
    category: "Dairy",
    stockQuantity: 15,
    unit: "bottle",
    reorderThreshold: 6,
    cost: 2.5,
    vendorId: "vendor_2",
  },
  {
    id: "inv_110",
    name: "Green Tea Leaves",
    category: "Beverages",
    stockQuantity: 8,
    unit: "lbs",
    reorderThreshold: 3,
    cost: 4.0,
    vendorId: "vendor_2",
  },
  {
    id: "inv_111",
    name: "Energy Drink Syrup",
    category: "Beverages",
    stockQuantity: 10,
    unit: "bottle",
    reorderThreshold: 4,
    cost: 3.5,
    vendorId: "vendor_2",
  },
  {
    id: "inv_112",
    name: "Black Tea Leaves",
    category: "Beverages",
    stockQuantity: 10,
    unit: "lbs",
    reorderThreshold: 4,
    cost: 3.0,
    vendorId: "vendor_2",
  },
];

export const MOCK_MENU_ITEMS: MenuItemType[] = [
  {
    id: "1",
    name: "Classic Burger",
    description:
      "Features with two juicy chicken patties, melted cheese, crisp lettuce, fresh tomatoes, etc. Perfect for those who crave a hearty, flavorful bite!",
    price: 9.99,
    image: "classic_burger.png",
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    sizes: standardSizes,
    addOns: burgerAddOns,
    modifierGroupIds: burgerModifiers.map((m) => m.id),
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-red-50",
    availability: true,
    stockTrackingMode: "in_stock",
    recipe: [
      { inventoryItemId: "inv_1", quantity: 1 },
      { inventoryItemId: "inv_2", quantity: 2 },
      { inventoryItemId: "inv_3", quantity: 1 },
      { inventoryItemId: "inv_8", quantity: 0.1 },
    ],
  },
  {
    id: "2",
    name: "BBQ Bacon Burger",
    description:
      "Smoky BBQ sauce, crispy bacon, and melted cheddar on a juicy patty.",
    price: 12.99,
    image: "bbq_bacon_burger.png",
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    availableDiscount: fifteenPercentOff,
    addOns: burgerAddOns,
    modifierGroupIds: burgerModifiers.map((m) => m.id),
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-orange-100",
    availability: true,
    stockTrackingMode: "in_stock",
    recipe: [
      { inventoryItemId: "inv_1", quantity: 1 },
      { inventoryItemId: "inv_2", quantity: 2 },
      { inventoryItemId: "inv_3", quantity: 1 },
      { inventoryItemId: "inv_4", quantity: 2 },
      { inventoryItemId: "inv_5", quantity: 0.05 },
    ],
  },
  {
    id: "3",
    name: "Vegan Wrap",
    description:
      "Fresh veggies, hummus, and greens wrapped in a soft tortilla.",
    price: 8.99,
    image: "vegan_wrap.png",
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: wrapAddOns,
    cardBgColor: "bg-green-100",
    availability: true,
    stockTrackingMode: "quantity",
    stockQuantity: 25,
    reorderThreshold: 5,
    recipe: [
      { inventoryItemId: "inv_6", quantity: 1 },
      { inventoryItemId: "inv_7", quantity: 0.1 },
      { inventoryItemId: "inv_8", quantity: 0.2 },
    ],
  },
  {
    id: "4",
    name: "Margherita Pizza",
    description:
      "Classic tomato, fresh mozzarella, and basil on a crispy crust.",
    price: 14.5,
    image: "margherita_pizza.png",
    meal: ["Dinner", "Specials"],
    category: ["Main Course"],
    addOns: pizzaAddOns,
    cardBgColor: "bg-yellow-100",
    availability: true,
    stockTrackingMode: "in_stock",
    recipe: [
      { inventoryItemId: "inv_9", quantity: 1 },
      { inventoryItemId: "inv_10", quantity: 0.2 },
      { inventoryItemId: "inv_11", quantity: 0.3 },
      { inventoryItemId: "inv_12", quantity: 0.05 },
    ],
  },
  {
    id: "5",
    name: "Chicken Caesar Salad",
    description:
      "Crisp romaine, Caesar dressing, and croutons with shaved parmesan.",
    price: 7.5,
    image: "chicken_caesar_salad.png",
    meal: ["Lunch", "Dinner"],
    category: ["Appetizers"],
    addOns: saladAddOns,
    cardBgColor: "bg-green-100",
    availability: false,
    stockTrackingMode: "out_of_stock",
    recipe: [
      { inventoryItemId: "inv_13", quantity: 0.5 },
      { inventoryItemId: "inv_14", quantity: 0.3 },
      { inventoryItemId: "inv_15", quantity: 0.1 },
      { inventoryItemId: "inv_16", quantity: 0.1 },
      { inventoryItemId: "inv_17", quantity: 0.05 },
    ],
  },
  {
    id: "6",
    name: "French Fries",
    description: "Golden and crispy fries, lightly seasoned.",
    price: 3.99,
    image: "french_fries.png",
    meal: ["Lunch", "Dinner", "Brunch"],
    category: ["Sides"],
    addOns: sidesAddOns,
    cardBgColor: "bg-yellow-100",
    availability: true,
    recipe: [{ inventoryItemId: "inv_18", quantity: 0.4 }],
  },
  {
    id: "7",
    name: "Onion Rings",
    description: "Beer-battered onion rings with a crunchy bite.",
    price: 4.99,
    image: "onion_rings.png",
    meal: ["Lunch", "Dinner"],
    category: ["Sides"],
    addOns: sidesAddOns,
    cardBgColor: "bg-purple-100",
    availability: true,
    recipe: [{ inventoryItemId: "inv_19", quantity: 0.3 }],
  },
  {
    id: "8",
    name: "Coca-Cola",
    description: "Refreshing classic cola served chilled.",
    price: 1.99,
    image: "coke.png",
    meal: ["Lunch", "Dinner", "Brunch", "Specials"],
    category: ["Drinks"],
    addOns: drinksAddOns,
    cardBgColor: "bg-gray-100",
    availability: true,
    recipe: [{ inventoryItemId: "inv_20", quantity: 0.05 }],
  },
  {
    id: "9",
    name: "Sprite",
    description: "Lemon-lime soda with a crisp, clean taste.",
    price: 1.99,
    image: "sprite.png",
    meal: ["Lunch", "Dinner", "Brunch", "Specials"],
    category: ["Drinks"],
    addOns: drinksAddOns,
    cardBgColor: "bg-green-100",
    availability: true,
    recipe: [{ inventoryItemId: "inv_21", quantity: 0.05 }],
  },
  {
    id: "10",
    name: "Chocolate Lava Cake",
    description: "Warm chocolate cake with a gooey molten center.",
    price: 6.99,
    image: "chocolate_cake.png",
    meal: ["Dinner"],
    category: ["Drinks"],
    addOns: dessertAddOns,
    cardBgColor: "bg-red-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_22", quantity: 0.2 },
      { inventoryItemId: "inv_26", quantity: 2 },
    ],
  },
  {
    id: "11",
    name: "New York Cheesecake",
    description: "Rich and creamy cheesecake on a buttery graham crust.",
    price: 7.25,
    image: "cheesecake.png",
    meal: ["Dinner"],
    category: ["Drinks"],
    addOns: dessertAddOns,
    cardBgColor: "bg-pink-100",
    availability: true,
    recipe: [{ inventoryItemId: "inv_23", quantity: 1 }],
  },
  {
    id: "12",
    name: "Fluffy Pancakes",
    description: "Stack of light, fluffy pancakes served with butter.",
    price: 8.5,
    image: "pancakes.png",
    meal: ["Brunch", "Specials"],
    category: ["Main Course"],
    availableDiscount: tenPercentOff,
    addOns: brunchAddOns,
    cardBgColor: "bg-indigo-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_24", quantity: 0.3 },
      { inventoryItemId: "inv_25", quantity: 0.05 },
    ],
  },
  {
    id: "13",
    name: "Eggs Benedict",
    description:
      "Poached eggs, Canadian bacon, and hollandaise on an English muffin.",
    price: 10.5,
    image: "eggs_benedict.png",
    meal: ["Brunch"],
    category: ["Main Course", "Brunch"],
    addOns: brunchAddOns,
    cardBgColor: "bg-cyan-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_26", quantity: 2 },
      { inventoryItemId: "inv_27", quantity: 0.2 },
      { inventoryItemId: "inv_28", quantity: 1 },
      { inventoryItemId: "inv_29", quantity: 0.1 },
    ],
  },
  {
    id: "14",
    name: "Pepperoni Supreme Pizza",
    description:
      "Loaded with pepperoni, Italian sausage, mushrooms, bell peppers, and mozzarella on our signature crust.",
    price: 16.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course", "Specials"],
    sizes: standardSizes,
    addOns: pizzaAddOns,
    modifierGroupIds: pizzaModifiers.map((m) => m.id),
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-red-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_9", quantity: 1 },
      { inventoryItemId: "inv_10", quantity: 0.2 },
      { inventoryItemId: "inv_11", quantity: 0.4 },
      { inventoryItemId: "inv_30", quantity: 0.2 },
      { inventoryItemId: "inv_8", quantity: 0.1 },
    ],
  },
  {
    id: "15",
    name: "Mediterranean Quinoa Bowl",
    description:
      "Nutrient-packed quinoa with roasted vegetables, feta cheese, olives, and lemon-tahini dressing.",
    price: 11.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: saladAddOns,
    modifierGroupIds: saladModifiers.map((m) => m.id),
    allergens: ["Dairy"],
    cardBgColor: "bg-green-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_8", quantity: 0.3 },
      { inventoryItemId: "inv_11", quantity: 0.1 },
      { inventoryItemId: "inv_7", quantity: 0.1 },
    ],
  },
  {
    id: "16",
    name: "Classic Club Sandwich",
    description:
      "Triple-decker with turkey, bacon, lettuce, tomato, and mayo on toasted bread.",
    price: 9.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: sandwichAddOns,
    modifierGroupIds: sandwichModifiers.map((m) => m.id),
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-yellow-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_2", quantity: 3 },
      { inventoryItemId: "inv_14", quantity: 0.3 },
      { inventoryItemId: "inv_4", quantity: 2 },
      { inventoryItemId: "inv_8", quantity: 0.1 },
    ],
  },
  {
    id: "17",
    name: "Creamy Alfredo Pasta",
    description:
      "Rich and creamy alfredo sauce over perfectly cooked pasta with parmesan cheese.",
    price: 13.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: pastaAddOns,
    modifierGroupIds: pastaModifiers.map((m) => m.id),
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-orange-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_11", quantity: 0.3 },
      { inventoryItemId: "inv_17", quantity: 0.1 },
    ],
  },
  {
    id: "18",
    name: "Buffalo Wings",
    description:
      "Crispy chicken wings tossed in our signature buffalo sauce, served with celery and blue cheese.",
    price: 8.99,
    meal: ["Lunch", "Dinner"],
    category: ["Appetizers"],
    addOns: sidesAddOns,
    allergens: ["Dairy"],
    cardBgColor: "bg-orange-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_14", quantity: 0.5 },
      { inventoryItemId: "inv_5", quantity: 0.1 },
    ],
  },
  {
    id: "19",
    name: "Loaded Nachos",
    description:
      "Tortilla chips topped with melted cheese, jalapeños, sour cream, and guacamole.",
    price: 7.99,
    meal: ["Lunch", "Dinner"],
    category: ["Appetizers"],
    addOns: sidesAddOns,
    allergens: ["Dairy"],
    cardBgColor: "bg-yellow-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_36", quantity: 0.3 }, // Tortilla Chips
      { inventoryItemId: "inv_11", quantity: 0.2 }, // Mozzarella Cheese
      { inventoryItemId: "inv_37", quantity: 0.1 }, // Jalapeños
      { inventoryItemId: "inv_38", quantity: 0.1 }, // Sour Cream
      { inventoryItemId: "inv_39", quantity: 0.1 }, // Guacamole
    ],
  },
  {
    id: "20",
    name: "Tomato Basil Soup",
    description:
      "Rich and creamy tomato soup with fresh basil, perfect comfort food.",
    price: 5.99,
    meal: ["Lunch", "Dinner"],
    category: ["Appetizers"],
    addOns: soupAddOns,
    modifierGroupIds: soupModifiers.map((m) => m.id),
    allergens: ["Dairy"],
    cardBgColor: "bg-red-50",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_40", quantity: 0.4 }, // Tomato Soup Base
      { inventoryItemId: "inv_12", quantity: 0.05 }, // Fresh Basil
      { inventoryItemId: "inv_11", quantity: 0.1 }, // Mozzarella Cheese
    ],
  },
  {
    id: "21",
    name: "Chicken Noodle Soup",
    description:
      "Classic comfort soup with tender chicken, egg noodles, and fresh vegetables.",
    price: 6.99,
    meal: ["Lunch", "Dinner"],
    category: ["Appetizers"],
    addOns: soupAddOns,
    modifierGroupIds: soupModifiers.map((m) => m.id),
    allergens: ["Gluten", "Eggs"],
    cardBgColor: "bg-yellow-50",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_41", quantity: 0.3 }, // Chicken Broth
      { inventoryItemId: "inv_14", quantity: 0.2 }, // Chicken Breast
      { inventoryItemId: "inv_42", quantity: 0.2 }, // Egg Noodles
      { inventoryItemId: "inv_8", quantity: 0.1 }, // Fresh Vegetables
    ],
  },
  {
    id: "22",
    name: "Fresh Brewed Coffee",
    description:
      "Premium blend of Arabica beans, freshly ground and brewed to perfection.",
    price: 2.99,
    meal: ["Lunch", "Dinner", "Brunch"],
    category: ["Drinks"],
    addOns: coffeeAddOns,
    modifierGroupIds: coffeeModifiers.map((m) => m.id),
    allergens: [],
    cardBgColor: "bg-yellow-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_43", quantity: 0.05 }, // Coffee Beans
      { inventoryItemId: "inv_44", quantity: 0.3 }, // Water
    ],
  },
  {
    id: "23",
    name: "Tropical Smoothie",
    description:
      "Blend of mango, pineapple, banana, and coconut milk for a refreshing treat.",
    price: 6.99,
    meal: ["Lunch", "Brunch"],
    category: ["Drinks"],
    addOns: smoothieAddOns,
    allergens: ["Dairy"],
    cardBgColor: "bg-orange-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_45", quantity: 0.2 }, // Mango
      { inventoryItemId: "inv_46", quantity: 0.2 }, // Pineapple
      { inventoryItemId: "inv_47", quantity: 0.1 }, // Banana
      { inventoryItemId: "inv_48", quantity: 0.3 }, // Coconut Milk
    ],
  },
  {
    id: "24",
    name: "Fresh Orange Juice",
    description:
      "Freshly squeezed orange juice, rich in vitamin C and natural sweetness.",
    price: 3.99,
    meal: ["Brunch"],
    category: ["Drinks"],
    allergens: [],
    cardBgColor: "bg-orange-50",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_49", quantity: 0.5 }, // Oranges
    ],
  },
  {
    id: "25",
    name: "Belgian Waffles",
    description:
      "Light and fluffy Belgian waffles served with butter and maple syrup.",
    price: 9.99,
    meal: ["Brunch"],
    category: ["Main Course"],
    addOns: breakfastAddOns,
    allergens: ["Gluten", "Dairy", "Eggs"],
    cardBgColor: "bg-yellow-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_50", quantity: 0.3 }, // Waffle Mix
      { inventoryItemId: "inv_26", quantity: 1 }, // Eggs
      { inventoryItemId: "inv_51", quantity: 0.1 }, // Butter
      { inventoryItemId: "inv_25", quantity: 0.1 }, // Maple Syrup
    ],
  },
  {
    id: "26",
    name: "Avocado Toast",
    description:
      "Smashed avocado on artisan bread with cherry tomatoes, feta, and balsamic glaze.",
    price: 8.99,
    meal: ["Brunch"],
    category: ["Main Course"],
    addOns: breakfastAddOns,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-green-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_52", quantity: 0.5 }, // Artisan Bread
      { inventoryItemId: "inv_53", quantity: 0.3 }, // Avocado
      { inventoryItemId: "inv_54", quantity: 0.1 }, // Cherry Tomatoes
      { inventoryItemId: "inv_55", quantity: 0.1 }, // Feta Cheese
      { inventoryItemId: "inv_56", quantity: 0.05 }, // Balsamic Glaze
    ],
  },
  {
    id: "27",
    name: "Tiramisu",
    description:
      "Classic Italian dessert with layers of coffee-soaked ladyfingers and mascarpone cream.",
    price: 7.99,
    meal: ["Dinner"],
    category: ["Dessert"],
    addOns: dessertAddOns,
    allergens: ["Dairy", "Eggs", "Gluten"],
    cardBgColor: "bg-purple-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_57", quantity: 0.2 }, // Ladyfingers
      { inventoryItemId: "inv_58", quantity: 0.3 }, // Mascarpone Cheese
      { inventoryItemId: "inv_43", quantity: 0.1 }, // Coffee
      { inventoryItemId: "inv_59", quantity: 0.1 }, // Cocoa Powder
    ],
  },
  {
    id: "28",
    name: "Chocolate Chip Cookies",
    description:
      "Warm, gooey chocolate chip cookies baked fresh daily, served with milk.",
    price: 4.99,
    meal: ["Lunch", "Dinner"],
    category: ["Dessert"],
    addOns: dessertAddOns,
    allergens: ["Gluten", "Dairy", "Eggs"],
    cardBgColor: "bg-red-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_60", quantity: 0.2 }, // Cookie Dough
      { inventoryItemId: "inv_61", quantity: 0.1 }, // Chocolate Chips
    ],
  },
  {
    id: "29",
    name: "Grilled Ribeye Steak",
    description:
      "Premium ribeye steak grilled to perfection, served with your choice of sides.",
    price: 24.99,
    meal: ["Dinner"],
    category: ["Main Course"],
    addOns: steakAddOns,
    modifierGroupIds: steakModifiers.map((m) => m.id),
    allergens: [],
    cardBgColor: "bg-purple-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_62", quantity: 0.8 }, // Ribeye Steak
      { inventoryItemId: "inv_63", quantity: 0.1 }, // Steak Seasoning
      { inventoryItemId: "inv_64", quantity: 0.1 }, // Herb Butter
    ],
  },
  {
    id: "30",
    name: "Grilled Salmon Fillet",
    description:
      "Fresh Atlantic salmon fillet grilled with herbs and lemon, served with seasonal vegetables.",
    price: 18.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: seafoodAddOns,
    modifierGroupIds: seafoodModifiers.map((m) => m.id),
    allergens: ["Fish"],
    cardBgColor: "bg-blue-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_65", quantity: 0.6 }, // Salmon Fillet
      { inventoryItemId: "inv_66", quantity: 0.1 }, // Lemon
      { inventoryItemId: "inv_67", quantity: 0.05 }, // Herbs
      { inventoryItemId: "inv_8", quantity: 0.2 }, // Seasonal Vegetables
    ],
  },
  {
    id: "31",
    name: "Fish Tacos",
    description:
      "Three soft tacos filled with grilled fish, cabbage slaw, and chipotle aioli.",
    price: 12.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: tacoAddOns,
    modifierGroupIds: tacoModifiers.map((m) => m.id),
    allergens: ["Fish", "Gluten"],
    cardBgColor: "bg-yellow-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_68", quantity: 0.4 }, // White Fish Fillet
      { inventoryItemId: "inv_69", quantity: 3 }, // Taco Shells
      { inventoryItemId: "inv_70", quantity: 0.2 }, // Cabbage Slaw
      { inventoryItemId: "inv_71", quantity: 0.1 }, // Chipotle Aioli
    ],
  },
  {
    id: "32",
    name: "Chicken Tacos",
    description:
      "Three soft tacos with grilled chicken, pico de gallo, and avocado crema.",
    price: 11.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: tacoAddOns,
    modifierGroupIds: tacoModifiers.map((m) => m.id),
    allergens: ["Gluten"],
    cardBgColor: "bg-green-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_14", quantity: 0.4 }, // Chicken Breast
      { inventoryItemId: "inv_69", quantity: 3 }, // Taco Shells
      { inventoryItemId: "inv_72", quantity: 0.2 }, // Pico de Gallo
      { inventoryItemId: "inv_73", quantity: 0.1 }, // Avocado Crema
    ],
  },
  {
    id: "33",
    name: "Tonkotsu Ramen",
    description:
      "Rich pork bone broth with chashu pork, soft-boiled egg, and fresh noodles.",
    price: 14.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: ramenAddOns,
    modifierGroupIds: ramenModifiers.map((m) => m.id),
    allergens: ["Gluten", "Eggs", "Soy"],
    cardBgColor: "bg-orange-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_74", quantity: 0.5 }, // Ramen Noodles
      { inventoryItemId: "inv_75", quantity: 0.4 }, // Pork Broth
      { inventoryItemId: "inv_76", quantity: 0.2 }, // Chashu Pork
      { inventoryItemId: "inv_26", quantity: 1 }, // Soft-Boiled Egg
      { inventoryItemId: "inv_77", quantity: 0.1 }, // Green Onions
    ],
  },
  {
    id: "34",
    name: "Miso Ramen",
    description:
      "Savory miso broth with tofu, corn, and bamboo shoots over fresh noodles.",
    price: 13.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: ramenAddOns,
    modifierGroupIds: ramenModifiers.map((m) => m.id),
    allergens: ["Gluten", "Soy"],
    cardBgColor: "bg-blue-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_74", quantity: 0.5 }, // Ramen Noodles
      { inventoryItemId: "inv_78", quantity: 0.4 }, // Miso Broth
      { inventoryItemId: "inv_79", quantity: 0.2 }, // Tofu
      { inventoryItemId: "inv_80", quantity: 0.1 }, // Corn
      { inventoryItemId: "inv_81", quantity: 0.1 }, // Bamboo Shoots
    ],
  },
  {
    id: "35",
    name: "California Roll",
    description:
      "Crab, avocado, and cucumber roll topped with sesame seeds and served with wasabi.",
    price: 8.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: sushiAddOns,
    modifierGroupIds: sushiModifiers.map((m) => m.id),
    allergens: ["Fish", "Soy"],
    cardBgColor: "bg-green-50",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_82", quantity: 0.3 }, // Sushi Rice
      { inventoryItemId: "inv_83", quantity: 0.1 }, // Nori Sheets
      { inventoryItemId: "inv_84", quantity: 0.1 }, // Imitation Crab
      { inventoryItemId: "inv_53", quantity: 0.1 }, // Avocado
      { inventoryItemId: "inv_85", quantity: 0.05 }, // Cucumber
    ],
  },
  {
    id: "36",
    name: "Spicy Tuna Roll",
    description:
      "Fresh tuna mixed with spicy mayo, wrapped in seaweed and rice.",
    price: 9.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: sushiAddOns,
    modifierGroupIds: sushiModifiers.map((m) => m.id),
    allergens: ["Fish", "Soy"],
    cardBgColor: "bg-red-50",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_82", quantity: 0.3 }, // Sushi Rice
      { inventoryItemId: "inv_83", quantity: 0.1 }, // Nori Sheets
      { inventoryItemId: "inv_86", quantity: 0.2 }, // Tuna
      { inventoryItemId: "inv_87", quantity: 0.05 }, // Spicy Mayo
    ],
  },
  {
    id: "37",
    name: "Chicken Teriyaki Bowl",
    description:
      "Grilled chicken glazed with teriyaki sauce over steamed rice with vegetables.",
    price: 13.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: pastaAddOns,
    allergens: ["Soy"],
    cardBgColor: "bg-orange-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_14", quantity: 0.4 }, // Chicken Breast
      { inventoryItemId: "inv_88", quantity: 0.5 }, // Steamed Rice
      { inventoryItemId: "inv_89", quantity: 0.1 }, // Teriyaki Sauce
      { inventoryItemId: "inv_8", quantity: 0.2 }, // Vegetables
    ],
  },
  {
    id: "38",
    name: "Beef Stir Fry",
    description:
      "Tender beef strips with mixed vegetables in a savory sauce over rice.",
    price: 15.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: pastaAddOns,
    allergens: ["Soy"],
    cardBgColor: "bg-green-200",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_90", quantity: 0.4 }, // Beef Strips
      { inventoryItemId: "inv_88", quantity: 0.5 }, // Steamed Rice
      { inventoryItemId: "inv_91", quantity: 0.1 }, // Stir Fry Sauce
      { inventoryItemId: "inv_8", quantity: 0.3 }, // Mixed Vegetables
    ],
  },
  {
    id: "39",
    name: "Vegetarian Buddha Bowl",
    description:
      "Quinoa, roasted vegetables, chickpeas, and tahini dressing in a nourishing bowl.",
    price: 12.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: saladAddOns,
    modifierGroupIds: saladModifiers.map((m) => m.id),
    allergens: ["Sesame"],
    cardBgColor: "bg-green-50",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_92", quantity: 0.4 }, // Quinoa
      { inventoryItemId: "inv_8", quantity: 0.3 }, // Roasted Vegetables
      { inventoryItemId: "inv_93", quantity: 0.2 }, // Chickpeas
      { inventoryItemId: "inv_94", quantity: 0.1 }, // Tahini Dressing
    ],
  },
  {
    id: "40",
    name: "BBQ Pulled Pork Sandwich",
    description:
      "Slow-cooked pulled pork with tangy BBQ sauce on a brioche bun with coleslaw.",
    price: 11.99,
    meal: ["Lunch", "Dinner"],
    category: ["Main Course"],
    addOns: sandwichAddOns,
    modifierGroupIds: sandwichModifiers.map((m) => m.id),
    allergens: ["Gluten"],
    cardBgColor: "bg-orange-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_95", quantity: 0.4 }, // Pulled Pork
      { inventoryItemId: "inv_96", quantity: 1 }, // Brioche Bun
      { inventoryItemId: "inv_5", quantity: 0.1 }, // BBQ Sauce
      { inventoryItemId: "inv_97", quantity: 0.1 }, // Coleslaw
    ],
  },
  {
    id: "41",
    name: "Mozzarella Sticks",
    description: "Crispy breaded mozzarella sticks served with marinara sauce.",
    price: 6.99,
    meal: ["Lunch", "Dinner"],
    category: ["Appetizers"],
    addOns: sidesAddOns,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-yellow-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_98", quantity: 0.3 }, // Mozzarella Sticks
      { inventoryItemId: "inv_99", quantity: 0.1 }, // Marinara Sauce
    ],
  },
  {
    id: "42",
    name: "Spinach Artichoke Dip",
    description: "Creamy spinach and artichoke dip served with tortilla chips.",
    price: 7.99,
    meal: ["Lunch", "Dinner"],
    category: ["Appetizers"],
    addOns: sidesAddOns,
    allergens: ["Dairy"],
    cardBgColor: "bg-green-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_100", quantity: 0.3 }, // Spinach Artichoke Dip
      { inventoryItemId: "inv_36", quantity: 0.2 }, // Tortilla Chips
    ],
  },
  {
    id: "43",
    name: "Chicken Quesadilla",
    description:
      "Grilled chicken, cheese, and peppers in a crispy tortilla with sour cream.",
    price: 8.99,
    meal: ["Lunch", "Dinner"],
    category: ["Appetizers"],
    addOns: sidesAddOns,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-orange-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_101", quantity: 1 }, // Flour Tortilla
      { inventoryItemId: "inv_14", quantity: 0.2 }, // Chicken Breast
      { inventoryItemId: "inv_11", quantity: 0.2 }, // Mozzarella Cheese
      { inventoryItemId: "inv_37", quantity: 0.1 }, // Bell Peppers
      { inventoryItemId: "inv_38", quantity: 0.1 }, // Sour Cream
    ],
  },
  {
    id: "44",
    name: "Calamari Rings",
    description:
      "Crispy fried calamari rings served with marinara and lemon aioli.",
    price: 9.99,
    meal: ["Lunch", "Dinner"],
    category: ["Appetizers"],
    addOns: sidesAddOns,
    allergens: ["Seafood", "Gluten"],
    cardBgColor: "bg-blue-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_102", quantity: 0.4 }, // Calamari Rings
      { inventoryItemId: "inv_99", quantity: 0.1 }, // Marinara Sauce
      { inventoryItemId: "inv_103", quantity: 0.1 }, // Lemon Aioli
    ],
  },
  {
    id: "45",
    name: "Stuffed Mushrooms",
    description:
      "Button mushrooms stuffed with herbed cream cheese and breadcrumbs.",
    price: 6.99,
    meal: ["Lunch", "Dinner"],
    category: ["Appetizers"],
    addOns: sidesAddOns,
    allergens: ["Dairy", "Gluten"],
    cardBgColor: "bg-yellow-200",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_104", quantity: 0.3 }, // Button Mushrooms
      { inventoryItemId: "inv_105", quantity: 0.2 }, // Herbed Cream Cheese
      { inventoryItemId: "inv_106", quantity: 0.1 }, // Breadcrumbs
    ],
  },
  {
    id: "46",
    name: "Sweet Potato Fries",
    description: "Crispy sweet potato fries seasoned with sea salt and herbs.",
    price: 4.99,
    meal: ["Lunch", "Dinner"],
    category: ["Sides"],
    addOns: sidesAddOns,
    allergens: [],
    cardBgColor: "bg-orange-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_107", quantity: 0.4 }, // Sweet Potatoes
    ],
  },
  {
    id: "47",
    name: "Mac and Cheese",
    description:
      "Creamy three-cheese macaroni and cheese with a crispy breadcrumb topping.",
    price: 5.99,
    meal: ["Lunch", "Dinner"],
    category: ["Sides"],
    addOns: sidesAddOns,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-yellow-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_108", quantity: 0.3 }, // Macaroni
      { inventoryItemId: "inv_109", quantity: 0.2 }, // Cheese Sauce
      { inventoryItemId: "inv_106", quantity: 0.1 }, // Breadcrumbs
    ],
  },
  {
    id: "48",
    name: "Green Tea",
    description:
      "Premium green tea leaves steeped to perfection, served hot or iced.",
    price: 2.99,
    meal: ["Lunch", "Dinner", "Brunch"],
    category: ["Drinks"],
    addOns: teaAddOns,
    allergens: [],
    cardBgColor: "bg-green-50",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_110", quantity: 0.05 }, // Green Tea Leaves
      { inventoryItemId: "inv_44", quantity: 0.3 }, // Water
    ],
  },
  {
    id: "49",
    name: "Energy Drink",
    description:
      "Refreshing energy drink with natural caffeine and B-vitamins.",
    price: 3.99,
    meal: ["Lunch", "Dinner"],
    category: ["Drinks"],
    addOns: energyDrinkAddOns,
    allergens: [],
    cardBgColor: "bg-red-100",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_111", quantity: 0.3 }, // Energy Drink Syrup
    ],
  },
  {
    id: "50",
    name: "Iced Tea",
    description: "Freshly brewed black tea served over ice with lemon.",
    price: 2.49,
    meal: ["Lunch", "Dinner", "Brunch"],
    category: ["Drinks"],
    addOns: teaAddOns,
    allergens: [],
    cardBgColor: "bg-yellow-200",
    availability: true,
    recipe: [
      { inventoryItemId: "inv_112", quantity: 0.05 }, // Black Tea Leaves
      { inventoryItemId: "inv_66", quantity: 0.05 }, // Lemon
    ],
  },
];

export const MOCK_TABLES: TableType[] = [
  // Top Row (Circles)
  {
    id: "cashier-1",
    name: "Cashier",
    status: "Not in Service", // Status doesn't really apply, but we need one
    capacity: 0,
    component: CashierStand,
    x: 50,
    y: 300,
    rotation: 0,
    type: "static-object", // Set its type
  },
  {
    id: "8",
    name: "T-8",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 40,
    y: 40,
    rotation: 0,
    type: "table",
  },
  {
    id: "7",
    name: "T-7",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 160,
    y: 40,
    rotation: 0,
    type: "table",
  },
  {
    id: "6",
    name: "T-6",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 280,
    y: 40,
    rotation: 0,
    type: "table",
  },
  {
    id: "5",
    name: "T-5",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 400,
    y: 40,
    rotation: 0,

    type: "table",
  },
  {
    id: "1",
    name: "T-1",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 600,
    y: 40,
    rotation: 0,
    type: "table",
  },
  {
    id: "2",
    name: "T-2",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 720,
    y: 40,
    rotation: 0,
    type: "table",
  },
  // Second Row
  {
    id: "4",
    name: "T-4",
    status: "Available",
    capacity: 4,
    component: TableSquare4Chair,
    x: 600,
    y: 150,
    rotation: 0,
    type: "table",
  },
  {
    id: "3",
    name: "T-3",
    status: "Needs Cleaning",
    capacity: 4,
    component: TableSquare4Chair,
    x: 720,
    y: 150,
    rotation: 0,
    type: "table",
  },
  // Middle Rows (Squares)
  {
    id: "10",
    name: "T-10",
    status: "Needs Cleaning",
    capacity: 4,
    component: TableSquare4Chair,
    x: 200,
    y: 250,
    rotation: 0,
    type: "table",
  },
  {
    id: "9",
    name: "T-9",
    status: "Available",
    capacity: 4,
    component: TableSquare4Chair,
    x: 350,
    y: 250,
    rotation: 0,
    type: "table",
  },
  {
    id: "11",
    name: "T-11",
    status: "Available",
    capacity: 4,
    component: TableSquare4Chair,
    x: 200,
    y: 350,
    rotation: 0,
    type: "table",
  },
  {
    id: "12",
    name: "T-12",
    status: "Available",
    capacity: 4,
    component: TableSquare4Chair,
    x: 350,
    y: 350,
    rotation: 0,
    type: "table",
  },
  {
    id: "13",
    name: "T-13",
    status: "Available",
    capacity: 8,
    component: TableSquare8Chair,
    x: 660,
    y: 280,
    rotation: 0,
    type: "table",
  },
  {
    id: "14",
    name: "T-14",
    status: "Needs Cleaning",
    capacity: 8,
    component: TableSquare8Chair,
    x: 660,
    y: 380,
    rotation: 0,
    type: "table",
  },
  {
    id: "15",
    name: "T-15",
    status: "Available",
    capacity: 8,
    component: TableSquare8Chair,
    x: 660,
    y: 480,
    rotation: 0,
    type: "table",
  },
];

export const PARTNER_LOGO_MAP = {
  "Door Dash": require("@/assets/images/doordash.png"),
  grubhub: require("@/assets/images/grubhub.png"),
  "Uber-Eats": require("@/assets/images/uber-eats.png"),
  "Food Panda": require("@/assets/images/food-panda.png"),
};

const sampleOrderItems: CartItem[] = [
  {
    id: "burger_1",
    menuItemId: "1",
    name: "Double Cheeseburger",
    quantity: 1,
    originalPrice: 7.25,
    price: 13.25,
    customizations: {
      size: { id: "size_lg", name: "Large", priceModifier: 2.0 },
      addOns: [
        { id: "addon_onion", name: "Extra onions", price: 1.0 },
        { id: "addon_cheese", name: "Extra Cheese", price: 1.5 },
        { id: "addon_egg", name: "Extra Fried Egg", price: 1.5 },
      ],
      notes: "Make the cheese more melted",
    },
    image: "classic_burger.png",
  },
  {
    id: "burger_2",
    menuItemId: "1",
    name: "Double Cheeseburger",
    quantity: 1,
    originalPrice: 7.25, // Assuming originalPrice is the base price
    price: 7.25, // Assuming price is the final price after customizations
    customizations: {
      size: { id: "size_reg", name: "Regular", priceModifier: 0 },
    },
    image: "classic_burger.png",
  },
  {
    id: "coke_1",
    menuItemId: "8",
    name: "Coca-Cola",
    quantity: 1,
    originalPrice: 1.99, // Assuming originalPrice is the base price
    price: 1.99, // Assuming price is the final price after customizations
    customizations: {},
    image: "coke.png",
  },
];

export const MOCK_ONLINE_ORDERS: OnlineOrder[] = [
  // Add a variety of orders with different statuses and partners
  {
    id: "#45654",
    status: "New Orders",
    deliveryPartner: "Door Dash",
    customerName: "John Jones",
    total: 520,
    itemCount: 10,
    timestamp: "02/03/25, 05:36 PM",
    customerDetails: {
      id: "#54568",
      phone: "+560934856",
      email: "john@gmail.com",
    },
    paymentStatus: "Paid",
    items: sampleOrderItems,
  },
  {
    id: "#45655",
    status: "New Orders",
    deliveryPartner: "Uber-Eats",
    customerName: "Jane Smith",
    total: 350,
    itemCount: 5,
    timestamp: "02/03/25, 05:38 PM",
    customerDetails: {
      id: "#54569",
      phone: "+123456789",
      email: "jane@gmail.com",
    },
    paymentStatus: "Paid",
    items: sampleOrderItems,
  },
  {
    id: "#45656",
    status: "Confirmed/In-Process",
    deliveryPartner: "Food Panda",
    customerName: "Alex Ray",
    total: 410,
    itemCount: 8,
    timestamp: "02/03/25, 05:30 PM",
    customerDetails: {
      id: "#54570",
      phone: "+987654321",
      email: "alex@gmail.com",
    },
    paymentStatus: "Paid",
    items: sampleOrderItems,
  },
  {
    id: "#45657",
    status: "Confirmed/In-Process",
    deliveryPartner: "grubhub",
    customerName: "Emily Clark",
    total: 600,
    itemCount: 12,
    timestamp: "02/03/25, 05:25 PM",
    customerDetails: {
      id: "#54571",
      phone: "+555555555",
      email: "emily@gmail.com",
    },
    paymentStatus: "Paid",
    items: sampleOrderItems,
  },
  {
    id: "#45658",
    status: "Ready to Dispatch",
    deliveryPartner: "Uber-Eats",
    customerName: "Michael Bee",
    total: 220,
    itemCount: 3,
    timestamp: "02/03/25, 05:20 PM",
    customerDetails: {
      id: "#54572",
      phone: "+444444444",
      email: "michael@gmail.com",
    },
    paymentStatus: "Paid",
    items: sampleOrderItems,
  },
  {
    id: "#45659",
    status: "Dispatched",
    deliveryPartner: "Food Panda",
    customerName: "Sarah Day",
    total: 750,
    itemCount: 15,
    timestamp: "02/03/25, 05:15 PM",
    customerDetails: {
      id: "#54573",
      phone: "+666666666",
      email: "sarah@gmail.com",
    },
    paymentStatus: "Paid",
    items: sampleOrderItems,
  },
];

export const MOCK_PREVIOUS_ORDERS: PreviousOrder[] = [
  {
    serialNo: "001",
    orderDate: "Oct 16, 2024",
    orderTime: "09:31 AM",
    orderId: "#2010E10",
    paymentStatus: "In Progress",
    customer: "John Doe",
    server: "Jake Carter",
    itemCount: 5,
    type: "Dine In",
    total: 34.5,
    items: sampleOrderItems,
  },
  {
    serialNo: "002",
    orderDate: "Oct 16, 2024",
    orderTime: "09:35 AM",
    orderId: "#2010E11",
    paymentStatus: "Paid",
    customer: "Jane Smith",
    server: "Jessica",
    itemCount: 3,
    type: "Takeaway",
    total: 22.75,
    items: [],
  },
  {
    serialNo: "003",
    orderDate: "Oct 16, 2024",
    orderTime: "09:40 AM",
    orderId: "#2010E12",
    paymentStatus: "Paid",
    customer: "Alex Johnson",
    server: "Jake Carter",
    itemCount: 8,
    type: "Delivery",
    total: 105.25,
    items: sampleOrderItems,
  },
  {
    serialNo: "004",
    orderDate: "Oct 15, 2024",
    orderTime: "08:15 PM",
    orderId: "#2009E95",
    paymentStatus: "Refunded",
    customer: "Sarah Wilson",
    server: "Jessica",
    itemCount: 2,
    type: "Dine In",
    total: 15.0,
    items: [],
  },
  // Add 5-10 more mock orders to make the list feel full
];

export const MOCK_USER_PROFILE: UserProfile = {
  id: "#54568",
  employeeId: "JS002T",
  fullName: "Tom Hardy",
  dob: "04/09/1996",
  gender: "Male",
  country: "USA",
  address: "New York, USA",
  email: "tom@gmail.com",
  phone: "+8037247534858347",
  pin: "498843",
  profileImageUrl: "tom_hardy.jpg",
};

export const MOCK_SHIFT_STATUS: ShiftStatus = {
  status: "Clocked In",
  duration: "5 h 24 m",
  clockInTime: "08:01 AM",
};

export const MOCK_SHIFT_HISTORY: ShiftHistoryEntry[] = Array.from(
  { length: 7 },
  (_, i) => ({
    id: i.toString(),
    date: "02/03/2025",
    clockIn: "10:30 AM",
    breakInitiated: "12:30 PM",
    breakEnded: "01:30 PM",
    clockOut: "06:30 PM",
    duration: "8h 11m",
    role: "Cashier",
  })
);

export const MOCK_PRINTERS: PrinterDevice[] = [
  {
    id: "1",
    name: "Receipt Printer",
    isEnabled: true,
    status: "Connected",
    connectionType: "Wi-Fi",
    ipAddress: "192.168.1.101",
  },
  {
    id: "2",
    name: "Kitchen Printer",
    isEnabled: true,
    status: "Disconnected",
    connectionType: "Wi-Fi",
    ipAddress: "192.168.1.102",
  },
  {
    id: "3",
    name: "Bar Printer",
    isEnabled: false,
    status: "Disconnected",
    connectionType: "Bluetooth",
  },
];

export const MOCK_CATEGORIES = [
  { label: "Food", value: "Food" },
  { label: "Drinks", value: "Drinks" },
  { label: "Desserts", value: "Desserts" },
  { label: "Appetizers", value: "Appetizers" },
];

export const MOCK_PRINTER_RULES: PrinterRule[] = [
  {
    id: "rule1",
    isEnabled: true,
    category: "Food",
    printerId: MOCK_PRINTERS[0].id,
  },
  {
    id: "rule2",
    isEnabled: false,
    category: "Drinks",
    printerId: MOCK_PRINTERS[2].id,
  },
  {
    id: "rule3",
    isEnabled: false,
    category: "Desserts",
    printerId: MOCK_PRINTERS[1].id,
  },
];

export const MOCK_TERMINALS: PaymentTerminal[] = [
  {
    id: "TRM00123",
    name: "Terminal A-123",
    isEnabled: true,
    status: "Connected",
    batteryLevel: 85,
  },
  {
    id: "TRM00124",
    name: "Terminal B-124",
    isEnabled: true,
    status: "Disconnected",
    batteryLevel: 62,
  },
  {
    id: "TRM00234",
    name: "Terminal D-234",
    isEnabled: false,
    status: "Disconnected",
    batteryLevel: 45,
  },
];

export const MOCK_FOUND_TERMINALS = [
  { id: "Epson-TM", name: "Epson TM-m30II-NT" },
  { id: "PIXMA-E3470", name: "PIXMA E3470" },
  { id: "HP-9025", name: "HP OfficeJet Pro 9025" },
  { id: "Canon-TR4520", name: "Canon PIXMA TR4520" },
  { id: "Brother-HL", name: "Brother HL-L2390DW" },
];

export const MOCK_OFFLINE_ORDERS: OfflineOrder[] = Array(8).fill({
  serialNo: "001",
  orderDate: "Oct 16, 2024",
  orderTime: "09:31 AM",
  orderId: "#2010E10",
  server: "Jake Carter",
  total: 34.5,
});

export const salesData = [
  { hour: 6, today: 180, yesterday: 320 },
  { hour: 8, today: 250, yesterday: 410 },
  { hour: 10, today: 310, yesterday: 240 },
  { hour: 12, today: 190, yesterday: 445 },
  { hour: 14, today: 360, yesterday: 330 },
  { hour: 16, today: 420, yesterday: 290 },
  { hour: 18, today: 320, yesterday: 500 },
  { hour: 20, today: 380, yesterday: 240 },
];

// Mock data for the "Open vs Closed Checks" donut chart
export const checksData = [
  { x: "Open", y: 22.19 },
  { x: "Closed", y: 77.81 },
];

// Mock data for the "Check Status Overview" donut chart
export const checkStatusData = [
  { x: "Completed", y: 56.2 },
  { x: "Pending", y: 34.5 },
  { x: "In Progress", y: 9.3 },
];

// Mock data for the "Top Selling Items" bar chart
export const topItemsData = [
  { name: "Crispy Cheese Burger", quantity: 18 },
  { name: "Chicken Alfredo Pasta", quantity: 13 },
  { name: "Spicy Chicken Burger", quantity: 10 },
  { name: "Beef Shawarma Wrap", quantity: 9 },
  { name: "BBQ Chicken Wings", quantity: 7 },
];

export const MOCK_TRACKED_ORDERS: TrackedOrder[] = [
  {
    id: "1",
    customerName: "John Jones",
    status: "On kitchen Hand",
    type: "Dine In",
    table: 2,
    timestamp: "09:00 AM",
    totalItems: 5,
    items: [
      { name: "Cheese pizza", quantity: 1 },
      { name: "Coffee", quantity: 1 },
      { name: "Cheese pizza", quantity: 1 },
      { name: "Cheese pizza", quantity: 1 },
      { name: "Fries", quantity: 1 },
    ],
  },
  {
    id: "2",
    customerName: "Emily Smith",
    status: "Preparing",
    type: "Takeout",
    table: 0,
    timestamp: "09:02 AM",
    totalItems: 3,
    items: [
      { name: "Vegan Wrap", quantity: 1 },
      { name: "Salad", quantity: 1 },
      { name: "Water", quantity: 1 },
    ],
  },
  {
    id: "3",
    customerName: "Alex Ray",
    status: "On kitchen Hand",
    type: "Dine In",
    table: 5,
    timestamp: "09:05 AM",
    totalItems: 2,
    items: [
      { name: "BBQ Bacon Burger", quantity: 1 },
      { name: "Coke", quantity: 1 },
    ],
  },
  {
    id: "4",
    customerName: "Sarah Day",
    status: "Ready",
    type: "Delivery",
    table: 0,
    timestamp: "09:08 AM",
    totalItems: 6,
    items: [
      { name: "Margherita Pizza", quantity: 2 },
      { name: "Garlic Bread", quantity: 2 },
      { name: "Sprite", quantity: 2 },
    ],
  },
  {
    id: "5",
    customerName: "Michael Bee",
    status: "On kitchen Hand",
    type: "Dine In",
    table: 8,
    timestamp: "09:10 AM",
    totalItems: 4,
    items: [
      { name: "Pancakes", quantity: 1 },
      { name: "Orange Juice", quantity: 1 },
      { name: "Coffee", quantity: 2 },
    ],
  },
];

export const MOCK_CHECKS: Check[] = [
  {
    serialNo: "001",
    checkNo: "27891",
    payee: "John Doe",
    amount: 34.5,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
    status: "Pending",
    items: [
      { name: "Item 1", price: 25.0 },
      { name: "Item 2", price: 20.0 },
    ],
    subtotal: 45.0,
    tax: 5.0,
    tips: 5.0,
    total: 55.0,
  },
  {
    serialNo: "002",
    checkNo: "45103",
    payee: "Jane Smith",
    amount: 34.5,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
    status: "Cleared",
    items: [],
    subtotal: 0,
    tax: 0,
    tips: 0,
    total: 0,
  },
  {
    serialNo: "003",
    checkNo: "88784",
    payee: "John Hart",
    amount: 34.5,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
    status: "Cleared",
    items: [],
    subtotal: 0,
    tax: 0,
    tips: 0,
    total: 0,
  },
  {
    serialNo: "004",
    checkNo: "12095",
    payee: "Peter Jones",
    amount: 34.5,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
    status: "Voided",
    items: [],
    subtotal: 0,
    tax: 0,
    tips: 0,
    total: 0,
  },
  {
    serialNo: "005",
    checkNo: "63487",
    payee: "Sarah Davis",
    amount: 34.5,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
    status: "Cleared",
    items: [],
    subtotal: 0,
    tax: 0,
    tips: 0,
    total: 0,
  },
  // Add more mock checks to fill the list
];

export const MOCK_DRAWER_SUMMARIES: DrawerSummary[] = [
  {
    id: "1",
    status: "Closed",
    cashier: "Jessica Turner",
    drawerName: "Main Counter",
    startingCash: 150.0,
    expectedCash: 550.75,
    actualCash: 550.75,
    difference: 0.0,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
  },
  {
    id: "2",
    status: "Closed",
    cashier: "Jessica Turner",
    drawerName: "Host Stand",
    startingCash: 150.0,
    expectedCash: 550.75,
    actualCash: 550.75,
    difference: 0.0,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
  },
  {
    id: "3",
    status: "Open",
    cashier: "Jessica Turner",
    drawerName: "Manager's Drawer",
    startingCash: 200.0,
    expectedCash: 412.5,
    actualCash: null,
    difference: null,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
  },
  {
    id: "4",
    status: "Closed",
    cashier: "Jessica Turner",
    drawerName: "Bar",
    startingCash: 150.0,
    expectedCash: 550.75,
    actualCash: 550.75,
    difference: 0.0,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
  },
  {
    id: "5",
    status: "Closed",
    cashier: "Jessica Turner",
    drawerName: "Service Station 1",
    startingCash: 150.0,
    expectedCash: 550.75,
    actualCash: 550.75,
    difference: 0.0,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
  },
  {
    id: "6",
    status: "Closed",
    cashier: "Jessica Turner",
    drawerName: "Service Station 2",
    startingCash: 150.0,
    expectedCash: 550.75,
    actualCash: 550.75,
    difference: 0.0,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
  },
  {
    id: "7",
    status: "Closed",
    cashier: "Jessica Turner",
    drawerName: "Patio",
    startingCash: 150.0,
    expectedCash: 550.75,
    actualCash: 550.75,
    difference: 0.0,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
  },
  {
    id: "8",
    status: "Cleared",
    cashier: "Jessica Turner",
    drawerName: "Drawer 1",
    startingCash: 34.5,
    expectedCash: 34.5,
    actualCash: 34.5,
    difference: 0.0,
    dateIssued: "Oct 16, 2024",
    timeIssued: "09:31 AM",
  },
];

export const MOCK_EMPLOYEE_SHIFTS: EmployeeShift[] = [
  {
    id: "1",
    name: "Ethan Brooks",
    jobTitle: "Manager",
    clockInStatus: "Clocked In",
    clockOutStatus: "Clocked Out",
    clockInTime: "10:00 AM",
    clockOutTime: "10:00 AM",
    totalHours: "7 hours, 5 minutes",
    profile: {
      id: "#4856",
      dob: "04/09/1996",
      role: "Manager",
      gender: "Male",
      country: "USA",
      address: "New York, USA",
    },
  },
  {
    id: "2",
    name: "Ava Simmons",
    jobTitle: "Cashier",
    clockInStatus: "Clocked In",
    clockOutStatus: "N/A",
    clockInTime: "9:00 AM",
    clockOutTime: "N/A",
    totalHours: "N/A",
    profile: {
      id: "#4857",
      dob: "...",
      role: "Cashier",
      gender: "Female",
      country: "USA",
      address: "...",
    },
  },
  {
    id: "3",
    name: "Olivia Carter",
    jobTitle: "Cashier",
    clockInStatus: "Clocked In",
    clockOutStatus: "N/A",
    clockInTime: "9:00 AM",
    clockOutTime: "N/A",
    totalHours: "N/A",
    profile: {
      id: "#4858",
      dob: "...",
      role: "Cashier",
      gender: "Female",
      country: "USA",
      address: "...",
    },
  },
  {
    id: "4",
    name: "Sophia Bell",
    jobTitle: "Cashier",
    clockInStatus: "Clocked In",
    clockOutStatus: "N/A",
    clockInTime: "9:00 AM",
    clockOutTime: "N/A",
    totalHours: "N/A",
    profile: {
      id: "#4859",
      dob: "...",
      role: "Cashier",
      gender: "Female",
      country: "USA",
      address: "...",
    },
  },
  {
    id: "5",
    name: "Mason Hall",
    jobTitle: "Cashier",
    clockInStatus: "Clocked In",
    clockOutStatus: "Clocked Out",
    clockInTime: "9:00 AM",
    clockOutTime: "10:00 AM",
    totalHours: "7 hours, 5 minutes",
    profile: {
      id: "#4860",
      dob: "...",
      role: "Cashier",
      gender: "Male",
      country: "USA",
      address: "...",
    },
  },
  // ... add more employees to fill the list
];

export const MOCK_CUSTOMERS: Customer[] = [
  {
    id: "cust_1",
    name: "John Smith",
    phoneNumber: "555-123-4567",
    address: "123 Main St, Anytown, USA",
    email: "john.smith@example.com",
    createdAt: new Date(),
    totalOrders: 5,
  },
  {
    id: "cust_2",
    name: "Jane Doe",
    phoneNumber: "555-987-6543",
    address: "456 Oak Ave, Sometown, USA",
    email: "jane.doe@example.com",
    createdAt: new Date(),
    totalOrders: 2,
  },
  {
    id: "cust_3",
    name: "Mike Johnson",
    phoneNumber: "555-555-1212",
    address: "", // No address for this customer
    email: "mike.j@example.com",
    createdAt: new Date(),
    totalOrders: 12,
  },
  {
    id: "cust_4",
    name: "Jessica Williams",
    phoneNumber: "555-333-4444",
    address: "789 Pine Ln, Otherville, USA",
    email: "jess.w@example.com",
    createdAt: new Date(),
    totalOrders: 1,
  },
];
