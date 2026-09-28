import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  // Hosting platforms (e.g. Render) inject PORT; local dev uses API_PORT.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port);
  console.log(`API listening on http://127.0.0.1:${port}/api`);
}

void bootstrap();
