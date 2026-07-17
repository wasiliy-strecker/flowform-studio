import { ConsoleLogger, Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: false,
    logger: new ConsoleLogger({
      json: process.env.NODE_ENV !== 'development',
      colors: process.env.NODE_ENV === 'development',
    }),
  })
  app.enableShutdownHooks()
  app.setGlobalPrefix('api/v1')
  app.enableCors({
    origin: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173',
    credentials: true,
  })

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FlowForm Studio API')
    .setDescription('Versioned API for visual forms, sandboxes, submissions, and approvals')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-sandbox-token' }, 'sandbox')
    .build()
  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/docs', app, document)

  const port = Number(process.env.API_PORT ?? 3000)
  await app.listen(port, '0.0.0.0')
  Logger.log(`FlowForm Studio API listening on port ${port}`, 'Bootstrap')
}

void bootstrap()
