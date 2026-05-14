import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new BadRequestException('Email is already registered.');
    }

    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      ...dto,
      password,
    });

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    return user;
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revoked: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!activeTokens.length) {
      throw new ForbiddenException('Refresh token is not valid.');
    }

    const matchedToken = await Promise.all(
      activeTokens.map(async (token) => ({
        token,
        match: await bcrypt.compare(refreshToken, token.tokenHash),
      })),
    ).then((items) => items.find((item) => item.match));

    if (!matchedToken) {
      throw new ForbiddenException('Refresh token is not valid.');
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true },
    });

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new ForbiddenException('User not found.');
    }

    const newTokens = await this.getTokens(user.id, user.email, user.role);
    await this.storeRefreshToken(user.id, newTokens.refreshToken);

    return newTokens;
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true },
    });

    return { success: true };
  }

  async getAuthUser(userId: string) {
    return this.usersService.findById(userId);
  }

  private async getTokens(userId: string, email: string, role: string) {
    const accessSecret = this.configService.get<string>('JWT_SECRET');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const accessExpiresIn = this.configService.get<string>('JWT_EXPIRATION') || '15m';
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';

    const payload = {
      sub: userId,
      email,
      role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
      refreshExpiresIn,
    };
  }

  private async storeRefreshToken(userId: string, refreshToken: string) {
    const expiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';
    const expiresAt = this.calculateExpiresAt(expiresIn);
    const tokenHash = await this.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
      },
    });
  }

  private async hashToken(token: string) {
    return bcrypt.hash(token, 10);
  }

  private calculateExpiresAt(expiration: string) {
    const numeric = parseInt(expiration.replace(/\D/g, ''), 10);

    if (expiration.endsWith('d')) {
      return new Date(Date.now() + numeric * 24 * 60 * 60 * 1000);
    }
    if (expiration.endsWith('h')) {
      return new Date(Date.now() + numeric * 60 * 60 * 1000);
    }
    if (expiration.endsWith('m')) {
      return new Date(Date.now() + numeric * 60 * 1000);
    }
    if (expiration.endsWith('s')) {
      return new Date(Date.now() + numeric * 1000);
    }

    return new Date(Date.now() + numeric * 1000);
  }
}
