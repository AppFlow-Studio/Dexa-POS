# DEXA POS

Welcome to **DEXA POS** – the next-generation Point of Sale system designed for modern businesses. DEXA POS combines powerful features, intuitive design, and seamless integrations to help you run your business efficiently, whether you’re managing a bustling restaurant, a cozy café, or a retail store.

## 🚀 Key Features

-   **Order Taking** Fast, flexible, and user-friendly order management for in-person and online sales.

-   **Online Orders** Effortlessly handle online orders and synchronize them with your in-house operations.

-   **Table Seating** Smart table management for restaurants and cafés, including reservations and real-time table status.

-   **Product Management** Easily add, update, and organize your products, categories, and inventory.

-   **All the Bells and Whistles**
    -   Real-time analytics and reporting
    -   Staff management and permissions
    -   Discounts, promotions, and loyalty programs
    -   Secure payments and multi-payment support
    -   Customizable receipts and branding
    -   Offline mode for uninterrupted service
    -   And much more!

## 🎨 Design & Prototyping

Check out our Figma design for a sneak peek at the DEXA POS user experience:
[DEXA POS Figma Design](https://www.figma.com/design/NkZX7aVPSDCtKq1wByeKCL/POS-design-Phase-1?node-id=0-1&p=f&t=eKojUwnjvZ6MOM1B-0)

## 📦 Getting Started

This section will guide you through setting up the DEXA POS project on your local machine for development and testing.

### Prerequisites

Before you begin, ensure you have the following installed on your system:
* [Node.js](https://nodejs.org/) (LTS version recommended)
* [Git](https://git-scm.com/)
* [Expo CLI](https://docs.expo.dev/get-started/installation/): `npm install -g expo-cli`

You will also need access to the credentials for our backend and payment services.

### Installation

1.  **Clone the Repository** Open your terminal and run the following command:
    ```bash
    git clone <your-private-repository-url>
    cd dexa-pos
    ```

2.  **Install Dependencies** Install the necessary project packages using `npm` or `yarn`:
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Configure Environment Variables** Create a `.env` file in the project's root directory. Add your Supabase project URL and public anon key:
    ```
    EXPO_PUBLIC_SUPABASE_URL="YOUR_SUPABASE_URL"
    EXPO_PUBLIC_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
    ```

4.  **Launch the Application** Start the Metro server with Expo:
    ```bash
    npx expo start
    ```
    You can now run the app on a simulator or scan the QR code with the Expo Go app on your physical device.

## 🛠️ Technology Stack

DEXA POS is built with a modern, scalable, and reliable tech stack to ensure a top-tier user experience.

* **Frontend:** The application is developed using **[React Native](https://reactnative.dev/)** and the **[Expo](https://expo.dev/)** framework, enabling rapid development and a consistent UI across both iOS and Android.

* **Backend:** We leverage **[Supabase](https://supabase.io/)** as our backend-as-a-service. It provides us with a powerful Postgres database, authentication, real-time subscriptions, and auto-generated APIs.

* **Payment Processing:** For secure and seamless payment transactions, DEXA POS is integrated with **[Dejavoo](https://www.dejavoosystems.com/)** payment terminals and processing services.
  
> DEXA POS is built to empower your business with all the tools you need to succeed in today’s fast-paced environment. Stay tuned for more updates!
