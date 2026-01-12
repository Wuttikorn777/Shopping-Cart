# 🛒  Shopping Cart System

A scalable and efficient e-commerce shopping cart application built with **Node.js**. This project demonstrates the integration of **Redis** for high-speed session management and caching, running within a fully containerized environment using **Docker**.

## 🚀 Project Overview

This application simulates a real-world e-commerce backend scenario where performance is key. By leveraging **Redis** as an in-memory data store, the system significantly reduces database load and improves response times for cart operations. The entire infrastructure is orchestrated via **Docker Compose**, ensuring a consistent development and deployment environment.

### Key Features

* **⚡ Redis Session Store:** High-performance session management and cart storage using Redis (In-memory key-value store).
* **🐳 Dockerized Infrastructure:** Fully containerized services (Node.js App, MySQL, Redis) orchestrated with Docker Compose for easy setup and reproducibility.
* **💾 Persistent Data:** MySQL 8.0 used for reliable storage of product catalogs and user data.
* **🛒 Dynamic Cart Operations:** Fast add-to-cart, update, and remove functionalities powered by server-side logic.

## 🛠️ Tech Stack

* **Backend:** Node.js, Express.js
* **Database:** MySQL 8.0
* **Caching & Session:** Redis
* **DevOps:** Docker, Docker Compose
* **Frontend:** EJS (Templating Engine), CSS3


## 📦 Installation & Setup

Follow these steps to run the project locally:

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/WuttikornFunk/Shopping-Cart.git
    cd Shopping-Cart
    ```

2.  **Start Infrastructure (Docker)**
    ```bash
    docker-compose up -d --build
    ```

3.  **Install Dependencies**
    ```bash
    npm install
    ```
    
3.  **Run Server**
    ```bash
    npm start
    ```
    
4.  Access the App Open your browser and navigate to: http://localhost:3000
