# AI-Powered Threat Detection System
# HTDM-Hybrid-Threat-Detection-Module-
HTDM (Hyper Threat Detection Model): AI system detecting digital threats across text, images, and videos. Predicts fake news, cyberbullying, and deepfake content using multi-modal ML/NLP techniques. Lightweight, accurate, and ready for real-time deployment.

## Overview

This project is a multi-module AI system designed to detect and analyze different types of digital threats, including:

* Fake News Detection
* Cyberbullying Detection
* AI-Generated Text Detection

The system integrates machine learning models with a user-friendly frontend to provide real-time analysis and predictions.

## ⚙️ Machine Learning Models Used

### 1. Fake News Detection

* Feature Extraction: TF-IDF Vectorization
* Model: Logistic Regression

### 2. Cyberbullying Detection

* Feature Extraction: TF-IDF Vectorization (with n-grams up to trigrams)
* Model: Logistic Regression

### 3. AI-Generated Text Detection

* Feature Extraction:

  * TF-IDF Vectorization
  * Linguistic Feature Engineering (sentence length, burstiness, vocabulary diversity, etc.)
* Scaling: StandardScaler
* Model: Logistic Regression

---

## 🧠 How the Model Works

1. Input text is preprocessed and cleaned
2. Text is converted into numerical features using TF-IDF
3. Additional linguistic features are computed for AI-text detection
4. Features are passed to a Logistic Regression classifier
5. The model outputs:

   * A binary label (0 or 1)
   * A probability score (confidence percentage)

## 📊 Output Interpretation

* **0 → Real / Clean / Human**
* **1 → Fake / Bullying / AI-generated**

The model also provides probability scores using the sigmoid function, representing confidence levels in predictions.

## 🗂️ Project Structure

* `app.py` → Backend API (FastAPI/Flask)
* `templates/` or `frontend/` → User Interface
* `models/` → Saved ML models (.pkl files)
* `requirements.txt` → Dependencies

## 🚀 Deployment

The project is deployed using cloud platforms for accessibility:

* Backend: Render
* Frontend: (optional) Vercel

## 🧪 Datasets Used

The system is trained using multiple publicly available datasets:

* PolitiFact
* GossipCop
* ISOT Fake News Dataset
* LIAR Dataset
* AI vs Human Text Datasets

## 📈 Features

* Multi-model detection system
* Real-time prediction
* Confidence score output
* Scalable and modular architecture

## 🔮 Future Improvements

* Integration with real-time news APIs
* Deep learning models (BERT, LSTM)
* Multilingual support
* Browser extension deployment

## 👨‍💻 Author
Developed as part of an AI/ML project focusing on real-world threat detection systems.

