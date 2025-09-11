import CashierStand from "@/components/tables/svg/CashierStand";
import TableSquare2Chair from "@/components/tables/svg/TableSquare2Chair";
import TableSquare4Chair from "@/components/tables/svg/TableSquare4Chair";
import TableSquare8Chair from "@/components/tables/svg/TableSquare8Chair";
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
  UserProfile
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
    id: "size",
    name: "Burger Size",
    type: "required",
    selectionType: "single",
    options: [
      { id: "single", name: "Single", price: 0 },
      { id: "double", name: "Double", price: 2.0 },
    ],
  },
  {
    id: "patty",
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
    id: "pizza-size",
    name: "Pizza Size",
    type: "required",
    selectionType: "single",
    options: [
      { id: "small", name: "Small (10\")", price: 0 },
      { id: "medium", name: "Medium (12\")", price: 3.0 },
      { id: "large", name: "Large (14\")", price: 5.0 },
    ],
  },
  {
    id: "crust",
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
    id: "salad-protein",
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
    id: "salad-toppings",
    name: "Salad Toppings",
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
    id: "sandwich-bread",
    name: "Sandwich Bread",
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
    id: "sandwich-protein",
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
    id: "cheese",
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
    id: "pasta-protein",
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
    id: "soup-size",
    name: "Soup Size",
    type: "required",
    selectionType: "single",
    options: [
      { id: "cup", name: "Cup", price: 0 },
      { id: "bowl", name: "Bowl", price: 2.0 },
    ],
  },
  {
    id: "soup-bread",
    name: "Soup Bread",
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
    id: "coffee-size",
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
    modifiers: burgerModifiers,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-red-50",
    availability: true,
  },
  {
    id: "2",
    name: "BBQ Bacon Burger",
    description:
      "Smoky BBQ sauce, crispy bacon, and melted cheddar on a juicy patty.",
    price: 12.99,
    image: "bbq_bacon_burger.png",
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    availableDiscount: fifteenPercentOff,
    addOns: burgerAddOns,
    modifiers: burgerModifiers,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-orange-100",
    availability: true,
  },
  {
    id: "3",
    name: "Vegan Wrap",
    description:
      "Fresh veggies, hummus, and greens wrapped in a soft tortilla.",
    price: 8.99,
    image: "vegan_wrap.png",
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: wrapAddOns,
    cardBgColor: "bg-green-100",
    availability: true,
  },
  {
    id: "4",
    name: "Margherita Pizza",
    description:
      "Classic tomato, fresh mozzarella, and basil on a crispy crust.",
    price: 14.5,
    image: "margherita_pizza.png",
    meal: ["Dinner", "Specials"],
    category: "Main Course",
    addOns: pizzaAddOns,
    cardBgColor: "bg-yellow-100",
    availability: true,
  },
  // --- Appetizers ---
  {
    id: "5",
    name: "Chicken Caesar Salad",
    description:
      "Crisp romaine, Caesar dressing, and croutons with shaved parmesan.",
    price: 7.5,
    image: "chicken_caesar_salad.png",
    meal: ["Lunch", "Dinner"],
    category: "Appetizers",
    addOns: saladAddOns,
    cardBgColor: "bg-green-100",
    availability: true,
  },
  // --- Sides ---
  {
    id: "6",
    name: "French Fries",
    description: "Golden and crispy fries, lightly seasoned.",
    price: 3.99,
    image: "french_fries.png",
    meal: ["Lunch", "Dinner", "Brunch"],
    category: "Sides",
    addOns: sidesAddOns,
    cardBgColor: "bg-yellow-100",
    availability: true,
  },
  {
    id: "7",
    name: "Onion Rings",
    description: "Beer-battered onion rings with a crunchy bite.",
    price: 4.99,
    image: "onion_rings.png",
    meal: ["Lunch", "Dinner"],
    category: "Sides",
    addOns: sidesAddOns,
    cardBgColor: "bg-purple-100",
    availability: true,
  },
  // --- Drinks ---
  {
    id: "8",
    name: "Coca-Cola",
    description: "Refreshing classic cola served chilled.",
    price: 1.99,
    image: "coke.png",
    meal: ["Lunch", "Dinner", "Brunch", "Specials"],
    category: "Drinks",
    addOns: drinksAddOns,
    cardBgColor: "bg-gray-100",
    availability: true,
  },
  {
    id: "9",
    name: "Sprite",
    description: "Lemon-lime soda with a crisp, clean taste.",
    price: 1.99,
    image: "sprite.png",
    meal: ["Lunch", "Dinner", "Brunch", "Specials"],
    category: "Drinks",
    addOns: drinksAddOns,
    cardBgColor: "bg-green-100",
    availability: true,
  },
  // --- Desserts ---
  {
    id: "10",
    name: "Chocolate Lava Cake",
    description: "Warm chocolate cake with a gooey molten center.",
    price: 6.99,
    image: "chocolate_cake.png",
    meal: ["Dinner"],
    category: "Dessert",
    addOns: dessertAddOns,
    cardBgColor: "bg-red-100",
    availability: true,
  },
  {
    id: "11",
    name: "New York Cheesecake",
    description: "Rich and creamy cheesecake on a buttery graham crust.",
    price: 7.25,
    image: "cheesecake.png",
    meal: ["Dinner"],
    category: "Dessert",
    addOns: dessertAddOns,
    cardBgColor: "bg-pink-100",
    availability: true,
  },
  // --- Brunch ---
  {
    id: "12",
    name: "Fluffy Pancakes",
    description: "Stack of light, fluffy pancakes served with butter.",
    price: 8.5,
    image: "pancakes.png",
    meal: ["Brunch", "Specials"],
    category: "Main Course",
    availableDiscount: tenPercentOff,
    addOns: brunchAddOns,
    cardBgColor: "bg-indigo-100",
    availability: true,
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
  },
  // --- Additional Main Course Items ---
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
    modifiers: pizzaModifiers,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-red-100",
    availability: true,
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
    modifiers: saladModifiers,
    allergens: ["Dairy"],
    cardBgColor: "bg-green-100",
    availability: true,
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
    modifiers: sandwichModifiers,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-yellow-100",
    availability: true,
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
    modifiers: pastaModifiers,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-orange-100",
    availability: true,
  },
  // --- Appetizers ---
  {
    id: "18",
    name: "Buffalo Wings",
    description:
      "Crispy chicken wings tossed in our signature buffalo sauce, served with celery and blue cheese.",
    price: 8.99,
    meal: ["Lunch", "Dinner"],
    category: "Appetizers",
    addOns: sidesAddOns,
    allergens: ["Dairy"],
    cardBgColor: "bg-orange-100",
    availability: true,
  },
  {
    id: "19",
    name: "Loaded Nachos",
    description:
      "Tortilla chips topped with melted cheese, jalapeños, sour cream, and guacamole.",
    price: 7.99,
    meal: ["Lunch", "Dinner"],
    category: "Appetizers",
    addOns: sidesAddOns,
    allergens: ["Dairy"],
    cardBgColor: "bg-yellow-100",
    availability: true,
  },
  // --- Soups (as Appetizers) ---
  {
    id: "20",
    name: "Tomato Basil Soup",
    description:
      "Rich and creamy tomato soup with fresh basil, perfect comfort food.",
    price: 5.99,
    meal: ["Lunch", "Dinner"],
    category: "Appetizers",
    addOns: soupAddOns,
    modifiers: soupModifiers,
    allergens: ["Dairy"],
    cardBgColor: "bg-red-50",
    availability: true,
  },
  {
    id: "21",
    name: "Chicken Noodle Soup",
    description:
      "Classic comfort soup with tender chicken, egg noodles, and fresh vegetables.",
    price: 6.99,
    meal: ["Lunch", "Dinner"],
    category: "Appetizers",
    addOns: soupAddOns,
    modifiers: soupModifiers,
    allergens: ["Gluten", "Eggs"],
    cardBgColor: "bg-yellow-50",
    availability: true,
  },
  // --- Drinks ---
  {
    id: "22",
    name: "Fresh Brewed Coffee",
    description:
      "Premium blend of Arabica beans, freshly ground and brewed to perfection.",
    price: 2.99,
    meal: ["Lunch", "Dinner", "Brunch"],
    category: "Drinks",
    addOns: coffeeAddOns,
    modifiers: coffeeModifiers,
    allergens: [],
    cardBgColor: "bg-yellow-100",
    availability: true,
  },
  {
    id: "23",
    name: "Tropical Smoothie",
    description:
      "Blend of mango, pineapple, banana, and coconut milk for a refreshing treat.",
    price: 6.99,
    meal: ["Lunch", "Brunch"],
    category: "Drinks",
    addOns: smoothieAddOns,
    allergens: ["Dairy"],
    cardBgColor: "bg-orange-100",
    availability: true,
  },
  {
    id: "24",
    name: "Fresh Orange Juice",
    description:
      "Freshly squeezed orange juice, rich in vitamin C and natural sweetness.",
    price: 3.99,
    meal: ["Brunch"],
    category: "Drinks",
    allergens: [],
    cardBgColor: "bg-orange-50",
    availability: true,
  },
  // --- Breakfast Items (as Main Course) ---
  {
    id: "25",
    name: "Belgian Waffles",
    description:
      "Light and fluffy Belgian waffles served with butter and maple syrup.",
    price: 9.99,
    meal: ["Brunch"],
    category: "Main Course",
    addOns: breakfastAddOns,
    allergens: ["Gluten", "Dairy", "Eggs"],
    cardBgColor: "bg-yellow-100",
    availability: true,
  },
  {
    id: "26",
    name: "Avocado Toast",
    description:
      "Smashed avocado on artisan bread with cherry tomatoes, feta, and balsamic glaze.",
    price: 8.99,
    meal: ["Brunch"],
    category: "Main Course",
    addOns: breakfastAddOns,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-green-100",
    availability: true,
  },
  // --- Desserts ---
  {
    id: "27",
    name: "Tiramisu",
    description:
      "Classic Italian dessert with layers of coffee-soaked ladyfingers and mascarpone cream.",
    price: 7.99,
    meal: ["Dinner"],
    category: "Dessert",
    addOns: dessertAddOns,
    allergens: ["Dairy", "Eggs", "Gluten"],
    cardBgColor: "bg-purple-100",
    availability: true,
  },
  {
    id: "28",
    name: "Chocolate Chip Cookies",
    description:
      "Warm, gooey chocolate chip cookies baked fresh daily, served with milk.",
    price: 4.99,
    meal: ["Lunch", "Dinner"],
    category: "Dessert",
    addOns: dessertAddOns,
    allergens: ["Gluten", "Dairy", "Eggs"],
    cardBgColor: "bg-red-100",
    availability: true,
  },
  // --- Additional Main Course Items (29-40) ---
  {
    id: "29",
    name: "Grilled Ribeye Steak",
    description:
      "Premium ribeye steak grilled to perfection, served with your choice of sides.",
    price: 24.99,
    meal: ["Dinner"],
    category: "Main Course",
    addOns: steakAddOns,
    modifiers: steakModifiers,
    allergens: [],
    cardBgColor: "bg-purple-100",
    availability: true,
  },
  {
    id: "30",
    name: "Grilled Salmon Fillet",
    description:
      "Fresh Atlantic salmon fillet grilled with herbs and lemon, served with seasonal vegetables.",
    price: 18.99,
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: seafoodAddOns,
    modifiers: seafoodModifiers,
    allergens: ["Fish"],
    cardBgColor: "bg-blue-100",
    availability: true,
  },
  {
    id: "31",
    name: "Fish Tacos",
    description:
      "Three soft tacos filled with grilled fish, cabbage slaw, and chipotle aioli.",
    price: 12.99,
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: tacoAddOns,
    modifiers: tacoModifiers,
    allergens: ["Fish", "Gluten"],
    cardBgColor: "bg-yellow-100",
    availability: true,
  },
  {
    id: "32",
    name: "Chicken Tacos",
    description:
      "Three soft tacos with grilled chicken, pico de gallo, and avocado crema.",
    price: 11.99,
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: tacoAddOns,
    modifiers: tacoModifiers,
    allergens: ["Gluten"],
    cardBgColor: "bg-green-100",
    availability: true,
  },
  {
    id: "33",
    name: "Tonkotsu Ramen",
    description:
      "Rich pork bone broth with chashu pork, soft-boiled egg, and fresh noodles.",
    price: 14.99,
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: ramenAddOns,
    modifiers: ramenModifiers,
    allergens: ["Gluten", "Eggs", "Soy"],
    cardBgColor: "bg-orange-100",
    availability: true,
  },
  {
    id: "34",
    name: "Miso Ramen",
    description:
      "Savory miso broth with tofu, corn, and bamboo shoots over fresh noodles.",
    price: 13.99,
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: ramenAddOns,
    modifiers: ramenModifiers,
    allergens: ["Gluten", "Soy"],
    cardBgColor: "bg-blue-100",
    availability: true,
  },
  {
    id: "35",
    name: "California Roll",
    description:
      "Crab, avocado, and cucumber roll topped with sesame seeds and served with wasabi.",
    price: 8.99,
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: sushiAddOns,
    modifiers: sushiModifiers,
    allergens: ["Fish", "Soy"],
    cardBgColor: "bg-green-50",
    availability: true,
  },
  {
    id: "36",
    name: "Spicy Tuna Roll",
    description:
      "Fresh tuna mixed with spicy mayo, wrapped in seaweed and rice.",
    price: 9.99,
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: sushiAddOns,
    modifiers: sushiModifiers,
    allergens: ["Fish", "Soy"],
    cardBgColor: "bg-red-50",
    availability: true,
  },
  {
    id: "37",
    name: "Chicken Teriyaki Bowl",
    description:
      "Grilled chicken glazed with teriyaki sauce over steamed rice with vegetables.",
    price: 13.99,
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: pastaAddOns,
    allergens: ["Soy"],
    cardBgColor: "bg-orange-100",
    availability: true,
  },
  {
    id: "38",
    name: "Beef Stir Fry",
    description:
      "Tender beef strips with mixed vegetables in a savory sauce over rice.",
    price: 15.99,
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: pastaAddOns,
    allergens: ["Soy"],
    cardBgColor: "bg-green-200",
    availability: true,
  },
  {
    id: "39",
    name: "Vegetarian Buddha Bowl",
    description:
      "Quinoa, roasted vegetables, chickpeas, and tahini dressing in a nourishing bowl.",
    price: 12.99,
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: saladAddOns,
    modifiers: saladModifiers,
    allergens: ["Sesame"],
    cardBgColor: "bg-green-50",
    availability: true,
  },
  {
    id: "40",
    name: "BBQ Pulled Pork Sandwich",
    description:
      "Slow-cooked pulled pork with tangy BBQ sauce on a brioche bun with coleslaw.",
    price: 11.99,
    meal: ["Lunch", "Dinner"],
    category: "Main Course",
    addOns: sandwichAddOns,
    modifiers: sandwichModifiers,
    allergens: ["Gluten"],
    cardBgColor: "bg-orange-100",
    availability: true,
  },
  // --- Additional Appetizers (41-45) ---
  {
    id: "41",
    name: "Mozzarella Sticks",
    description:
      "Crispy breaded mozzarella sticks served with marinara sauce.",
    price: 6.99,
    meal: ["Lunch", "Dinner"],
    category: "Appetizers",
    addOns: sidesAddOns,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-yellow-100",
    availability: true,
  },
  {
    id: "42",
    name: "Spinach Artichoke Dip",
    description:
      "Creamy spinach and artichoke dip served with tortilla chips.",
    price: 7.99,
    meal: ["Lunch", "Dinner"],
    category: "Appetizers",
    addOns: sidesAddOns,
    allergens: ["Dairy"],
    cardBgColor: "bg-green-100",
    availability: true,
  },
  {
    id: "43",
    name: "Chicken Quesadilla",
    description:
      "Grilled chicken, cheese, and peppers in a crispy tortilla with sour cream.",
    price: 8.99,
    meal: ["Lunch", "Dinner"],
    category: "Appetizers",
    addOns: sidesAddOns,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-orange-100",
    availability: true,
  },
  {
    id: "44",
    name: "Calamari Rings",
    description:
      "Crispy fried calamari rings served with marinara and lemon aioli.",
    price: 9.99,
    meal: ["Lunch", "Dinner"],
    category: "Appetizers",
    addOns: sidesAddOns,
    allergens: ["Seafood", "Gluten"],
    cardBgColor: "bg-blue-100",
    availability: true,
  },
  {
    id: "45",
    name: "Stuffed Mushrooms",
    description:
      "Button mushrooms stuffed with herbed cream cheese and breadcrumbs.",
    price: 6.99,
    meal: ["Lunch", "Dinner"],
    category: "Appetizers",
    addOns: sidesAddOns,
    allergens: ["Dairy", "Gluten"],
    cardBgColor: "bg-yellow-200",
    availability: true,
  },
  // --- Additional Sides (46-47) ---
  {
    id: "46",
    name: "Sweet Potato Fries",
    description:
      "Crispy sweet potato fries seasoned with sea salt and herbs.",
    price: 4.99,
    meal: ["Lunch", "Dinner"],
    category: "Sides",
    addOns: sidesAddOns,
    allergens: [],
    cardBgColor: "bg-orange-100",
    availability: true,
  },
  {
    id: "47",
    name: "Mac and Cheese",
    description:
      "Creamy three-cheese macaroni and cheese with a crispy breadcrumb topping.",
    price: 5.99,
    meal: ["Lunch", "Dinner"],
    category: "Sides",
    addOns: sidesAddOns,
    allergens: ["Gluten", "Dairy"],
    cardBgColor: "bg-yellow-100",
    availability: true,
  },
  // --- Additional Drinks (48-50) ---
  {
    id: "48",
    name: "Green Tea",
    description:
      "Premium green tea leaves steeped to perfection, served hot or iced.",
    price: 2.99,
    meal: ["Lunch", "Dinner", "Brunch"],
    category: "Drinks",
    addOns: teaAddOns,
    allergens: [],
    cardBgColor: "bg-green-50",
    availability: true,
  },
  {
    id: "49",
    name: "Energy Drink",
    description:
      "Refreshing energy drink with natural caffeine and B-vitamins.",
    price: 3.99,
    meal: ["Lunch", "Dinner"],
    category: "Drinks",
    addOns: energyDrinkAddOns,
    allergens: [],
    cardBgColor: "bg-red-100",
    availability: true,
  },
  {
    id: "50",
    name: "Iced Tea",
    description:
      "Freshly brewed black tea served over ice with lemon.",
    price: 2.49,
    meal: ["Lunch", "Dinner", "Brunch"],
    category: "Drinks",
    addOns: teaAddOns,
    allergens: [],
    cardBgColor: "bg-yellow-200",
    availability: true,
  },
];

export const MOCK_TABLES: TableType[] = [
  // Top Row (Circles)
  {
    id: "cashier-1",
    name: "",
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
  {
    id: "21",
    name: "T-21",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 200,
    y: 600,
    rotation: 0,
    type: "table",
  },
  {
    id: "20",
    name: "T-20",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 320,
    y: 600,
    rotation: 0,
    type: "table",
  },
  {
    id: "19",
    name: "T-19",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 440,
    y: 600,
    rotation: 0,
    type: "table",
  },
  {
    id: "18",
    name: "T-18",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 560,
    y: 600,
    rotation: 0,
    type: "table",
  },
  {
    id: "17",
    name: "T-17",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 680,
    y: 600,
    rotation: 0,
    type: "table",
  },
  {
    id: "16",
    name: "T-16",
    status: "Available",
    capacity: 2,
    component: TableSquare2Chair,
    x: 800,
    y: 600,
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
    itemId: "burger_1",
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
    itemId: "burger_2",
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
    itemId: "coke_1",
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
    type: "Take Away",
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

export const MOCK_INVENTORY_ITEMS: InventoryItem[] = [
  {
    id: "#2020E11",
    serialNo: "001",
    name: "Blueberry Muffin",
    image: require("@/assets/images/blueberry_muffin.png"),
    description: "Savory pastries filled with a blend of cheeses and herbs...",
    stock: 250,
    unit: "PCs",
    lastUpdate: "02/03/2025 10:30 AM",
    status: "Inactive",
    category: "Pastries",
    modifier: "None",
    availability: false,
  },
  {
    id: "#2040E13",
    serialNo: "002",
    name: "Sourdough Bread",
    image: require("@/assets/images/sourdough_bread.png"),
    description: "Artisan sourdough loaves with a crunchy crust...",
    stock: 250,
    unit: "PCs",
    lastUpdate: "02/03/2025 10:30 AM",
    status: "Draft",
    category: "Breads",
    modifier: "None",
    availability: true,
  },
  {
    id: "#2030E12",
    serialNo: "003",
    name: "Chocolate Croissant",
    image: require("@/assets/images/chocolate_croissant.png"),
    description: "Chocolate croissants with a rich, buttery flake...",
    stock: 250,
    unit: "PCs",
    lastUpdate: "02/03/2025 10:30 AM",
    status: "Active",
    category: "Pastries",
    modifier: "Chocolate",
    availability: true,
  },
  {
    id: "#2050E14",
    serialNo: "004",
    name: "Multigrain Bread",
    image: require("@/assets/images/multigrain_bread.png"),
    description: "Hearty multigrain bread packed with seeds...",
    stock: 0,
    unit: "PCs",
    lastUpdate: "02/03/2025 10:30 AM",
    status: "Out of Stock",
    category: "Breads",
    modifier: "None",
    availability: true,
  },
  {
    id: "#2080E17",
    serialNo: "005",
    name: "Fresh Baked Buns",
    image: require("@/assets/images/fresh_baked_buns.png"),
    description: "Flaky biscuit rounds, light and airy, ideal for breakfast.",
    stock: 250,
    unit: "PCs",
    lastUpdate: "02/03/2025 10:30 AM",
    status: "Active",
    category: "Breads",
    modifier: "None",
    availability: true,
  },
  {
    id: "#2090E18",
    serialNo: "006",
    name: "Cinnamon Roll",
    image: require("@/assets/images/cinnamon_roll.png"),
    description: "Delightful muffins bursting with seasonal fruits.",
    stock: 250,
    unit: "PCs",
    lastUpdate: "02/03/2025 10:30 AM",
    status: "Active",
    category: "Pastries",
    modifier: "Glaze",
    availability: true,
  },
  {
    id: "#2060E15",
    serialNo: "007",
    name: "Flaky Biscuit",
    image: require("@/assets/images/flaky_biscuit.png"),
    description: "Sweet cinnamon rolls drizzled with cream cheese icing.",
    stock: 0,
    unit: "PCs",
    lastUpdate: "02/03/2025 10:30 AM",
    status: "Out of Stock",
    category: "Pastries",
    modifier: "None",
    availability: true,
  },
  {
    id: "#2070E16",
    serialNo: "008",
    name: "Sesame Bagel",
    image: require("@/assets/images/sesame_bagel.png"),
    description:
      "Classic bagels, boiled and baked to achieve the perfect chewy texture.",
    stock: 0,
    unit: "PCs",
    lastUpdate: "02/03/2025 10:30 AM",
    status: "Out of Stock",
    category: "Breads",
    modifier: "Cream Cheese",
    availability: true,
  },
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
