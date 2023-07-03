import { Prisma } from "@prisma/client/extension";
import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

type Args = {
  db?: string;
  model?: string;
};

export const queryGPT = (_extensionArgs: Args) =>
  Prisma.defineExtension({
    name: "prisma-gpt",
    client: {
      async $queryGPT(str: string) {
        if (!str) {
          throw new Error("No query string provided");
        }
        const schema = require("fs").readFileSync(
          "prisma/schema.prisma",
          "utf8"
        );
        if (!schema) {
          throw new Error(
            "No schema provided. Please provide a prisma/schema.prisma file in the root of your project"
          );
        }

        const newLinesAndCarriageReturns = /[\r\n]+/gm;
        const database =
          _extensionArgs && _extensionArgs.db ? _extensionArgs.db : "sqlite";
        const prompt = `
          You are an AI assistant that returns raw sql queries using natural language. 
          You only output raw SQL queries. Never return anything other than raw SQL.
          Always begin the query with SELECT. You will be given the following schema:
           ${schema.replace(newLinesAndCarriageReturns, "")}
          Take the below query and return raw SQL(${database})):
           ${str}
`;
        const model =
          _extensionArgs && _extensionArgs.model
            ? _extensionArgs.model
            : "gpt-3.5-turbo";
        const response = await openai.createChatCompletion({
          model,
          messages: [{ role: "system", content: prompt }],
        });

        if (!response.data.choices) {
          throw new Error("No response from OpenAI");
        }

        const query = response.data.choices[0].message?.content;

        if (!query) {
          throw new Error("No SQL returned from OpenAI. Try again.");
        }

        const trimmed = query.replace(newLinesAndCarriageReturns, " ");
        console.log("prisma-gpt-query:", trimmed);
        const ctx = Prisma.getExtensionContext(this);

        try {
          const res = await (ctx as any).$queryRawUnsafe(trimmed);
          return res;
        } catch (e) {
          console.log(e);
        }
      },
    },
  });
