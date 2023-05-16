import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { Configuration, OpenAIApi } from "openai";
import { env } from "~/env.mjs";
import { base64Image } from "~/data/base64Image";
import AWS from "aws-sdk";

const BUCKET_NAME = "icon-generator-ai-app";

// AWS S3 bucket configuration
const s3 = new AWS.S3({
  credentials: {
    accessKeyId: env.ACCESS_KEY_ID,
    secretAccessKey: env.SECRET_ACCESS_KEY,
  },
});

// Openai / Dall-e configuration
const configuration = new Configuration({
  apiKey: env.DALLE_API_KEY,
});

const openai = new OpenAIApi(configuration);

async function generateIcon(prompt: string): Promise<string | undefined> {
  if (env.MOCK_DALLE === "true") {
    return base64Image;
    //"https:// /private/org-hLprmtJUGsANnrHyxYM3urMv/user-f1ny3HPDIN61TxjIOC0enYxC/img-nOqT38UD3KppanwcevvS3f8Z.png?st=2023-05-13T18%3A11%3A08Z&se=2023-05-13T20%3A11%3A08Z&sp=r&sv=2021-08-06&sr=b&rscd=inline&rsct=image/png&skoid=6aaadede-4fb3-4698-a8f6-684d7786b067&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skt=2023-05-12T20%3A37%3A19Z&ske=2023-05-13T20%3A37%3A19Z&sks=b&skv=2021-08-06&sig=HxVgoOZDWPG73tbWCmWHOuZfQ%2BC8gAKORcsrmTiemqE%3D";
  } else {
    const response = await openai.createImage({
      prompt,
      n: 1,
      size: "512x512",
      response_format: "b64_json",
    });
    return response.data.data[0]?.b64_json;
  }
}

export const generateRouter = createTRPCRouter({
  generateIcon: protectedProcedure
    .input(
      z.object({
        prompt: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Checks f user has enough credits
      const { count } = await ctx.prisma.user.updateMany({
        where: {
          id: ctx.session.user.id,
          credits: {
            gte: 1,
          },
        },
        data: {
          credits: {
            decrement: 1,
          },
        },
      });

      if (count <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "you do not have enough credits",
        });
      }

      const base64EncondedImage = await generateIcon(input.prompt);

      const icon = await ctx.prisma.icon.create({
        data: {
          prompt: input.prompt,
          userId: ctx.session.user.id,
        },
      });
      // Puts generated photo in S3 bucket
      await s3
        .putObject({
          Bucket: "icon-generator-ai-app",
          Body: Buffer.from(base64EncondedImage!, "base64"),
          Key: icon.id,
          ContentEncoding: "base64",
          ContentType: "image/png",
        })
        .promise();

      return {
        imageUrl: `https://${BUCKET_NAME}.s3.amazonaws.com/clhpgfc010001pn0t810ujtd5`,
      };
    }),
});
