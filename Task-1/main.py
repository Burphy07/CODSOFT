# Simple Rule-Based Chatbot

print("🤖 ChatBot: Hello! Type 'bye' to exit.")

while True:
    user_input = input("You: ").lower()

    # Greetings
    if user_input in ["hi", "hello", "hey"]:
        print("🤖 ChatBot: Hello! How can I help you?")

    # Asking name
    elif "your name" in user_input:
        print("🤖 ChatBot: I am a simple chatbot created using Python.")

    # Asking about health
    elif "how are you" in user_input:
        print("🤖 ChatBot: I am fine. Thanks for asking!")

    # Asking time
    elif "time" in user_input:
        from datetime import datetime
        current_time = datetime.now().strftime("%H:%M:%S")
        print(f"🤖 ChatBot: Current time is {current_time}")

    # Asking date
    elif "date" in user_input:
        from datetime import datetime
        current_date = datetime.now().strftime("%d-%m-%Y")
        print(f"🤖 ChatBot: Today's date is {current_date}")

    # Help command
    elif "help" in user_input:
        print("🤖 ChatBot: You can ask me about time, date, my name, or greet me.")

    # Exit condition
    elif user_input == "bye":
        print("🤖 ChatBot: Goodbye! Have a nice day.")
        break

    # Default response
    else:
        print("🤖 ChatBot: Sorry, I don't understand that.")