import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { RegionsModule } from './regions/regions.module';
import { StoresModule } from './stores/stores.module';
import { TasksModule } from './tasks/tasks.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { IncidentsModule } from './incidents/incidents.module';
import { AuditsModule } from './audits/audits.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MessagesModule } from './messages/messages.module';
import { WebsocketModule } from './websocket/websocket.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    RegionsModule,
    StoresModule,
    TasksModule,
    ChecklistsModule,
    IncidentsModule,
    AuditsModule,
    NotificationsModule,
    MessagesModule,
    WebsocketModule,
    ActivityLogsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
