import dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';
import fs from 'fs';



// Load environment variables
const OLLAMA_SERVER_URL = process.env.OLLAMA_SERVER_URL || "http://localhost:11434/api/chat";
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-r1:7b";
const BOT_NAME = process.env.BOT_NAME || "AI Bot"; // Load bot name from .env

// Function to get response, filter data, and save logs
async function getOllamaResponse(userMessage, conversationHistory) {
    try {
        // Adjust prompt for direct answers instead of summarization
        let prompt = `You are ${BOT_NAME}, an AI assistant in this Discord channel. Answer questions concisely and clearly while keeping conversations engaging. 
        
        Your responses should directly address the user's question rather than summarizing your role. If asked about your name, you reply: '${BOT_NAME}'. 
        
        Recent conversation history:\n${conversationHistory}\nUser Question: ${userMessage}\nResponse:`;

        const response = await axios.post(OLLAMA_SERVER_URL, {
            model: OLLAMA_MODEL,
            messages: [{ role: "user", content: prompt }]
        }, { responseType: "stream" });

        let fullResponse = "";
        let thoughtProcess = "";
        let captureResponse = false;

        response.data.on("data", chunk => {
            const data = JSON.parse(chunk.toString());
            if (data.message?.content) {
                const content = data.message.content;

                if (content.includes("</think>")) {
                    captureResponse = true;
                } else if (!captureResponse) {
                    thoughtProcess += content;  // Log everything before </think>
                } else {
                    fullResponse += content;  // Collect final response
                }

                console.log("Ollama Thinking:", content);  // Debugging in terminal
            }
        });

        return new Promise(resolve => {
            response.data.on("end", () => {
                const finalResponse = fullResponse.trim() || "No valid response received.";

                // Save thought process, user message, and final response to a log file
                const logEntry = `User Message: ${userMessage}\nConversation History:\n${conversationHistory}\nOllama Thinking:\n${thoughtProcess}\nFinal Response:\n${finalResponse}\n\n`;
                fs.appendFileSync("ollama_log.txt", logEntry);

                resolve(finalResponse);
            });
        });

    } catch (error) {
        console.error("Ollama API Error:", error.response?.data || error.message);
        return "I couldn't generate a response.";
    }
}


// Initialize Discord Bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on("messageCreate", async function(message) {
    try {
        if (message.author.bot) return;
        if (!message.mentions.has(client.user)) return;

        const userMessage = message.content.replace(`<@${client.user.id}>`, "").trim();
        if (!userMessage) return;

        message.channel.sendTyping();

        // Fetch recent conversation history
        const messages = await message.channel.messages.fetch({ limit: 10 });
        let history = messages.reverse().map(m => `${m.author.username}: ${m.content}`).join("\n");

        // Get summarized response from Ollama
        const reply = await getOllamaResponse(userMessage, history);

        // Split response into parts if exceeding 3000 characters
        const maxLength = 3000;
        let remainingReply = reply;
        while (remainingReply.length > 0) {
            const chunk = remainingReply.substring(0, maxLength);
            remainingReply = remainingReply.substring(maxLength);

            // Send formatted message with code block and user mention
            await message.channel.send(`<@${message.author.id}>\n\`\`\`${chunk}\`\`\``);
        }

    } catch (err) {
        console.error("Error:", err);
    }
});

// Login bot using environment token
client.login(DISCORD_TOKEN);
console.log("Connecting to Discord...");
console.log(`${BOT_NAME} is running...`);
console.log(`Ollama server at: ${process.env.OLLAMA_SERVER_URL}`);