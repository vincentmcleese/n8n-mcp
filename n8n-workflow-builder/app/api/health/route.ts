import { NextResponse } from 'next/server';
import { workflowDb } from '@/lib/db/client';
import { getEnv } from '@/lib/config/env';
import { logger } from '@/lib/utils/logger';

export async function GET() {
  logger.info('Health check requested');
  try {
    // Check environment variables
    let envStatus = 'ok';
    let envMessage = 'All required environment variables are set';
    
    try {
      getEnv();
      logger.info('Environment variables validated successfully');
    } catch (error) {
      envStatus = 'error';
      envMessage = error instanceof Error ? error.message : 'Environment validation failed';
      logger.error('Environment validation failed:', error);
    }
    
    // Check database connection
    let dbStatus = 'ok';
    let dbMessage = 'Database connection is healthy';
    let dbResponseTime: number | null = null;
    
    const startTime = Date.now();
    try {
      const isHealthy = await workflowDb.healthCheck();
      dbResponseTime = Date.now() - startTime;
      
      if (!isHealthy) {
        dbStatus = 'error';
        dbMessage = 'Database health check failed';
        logger.error('Database health check returned unhealthy status');
      } else {
        logger.info(`Database health check passed (${dbResponseTime}ms)`);
      }
    } catch (error) {
      dbStatus = 'error';
      dbMessage = error instanceof Error ? error.message : 'Database connection failed';
      dbResponseTime = Date.now() - startTime;
      logger.error('Database connection failed:', error);
    }
    
    // Overall status
    const overallStatus = envStatus === 'ok' && dbStatus === 'ok' ? 'healthy' : 'unhealthy';
    
    if (overallStatus === 'healthy') {
      logger.info('Health check completed: System is healthy');
    } else {
      logger.warn(`Health check completed: System is unhealthy (env: ${envStatus}, db: ${dbStatus})`);
    }
    
    // Build response
    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        environment: {
          status: envStatus,
          message: envMessage
        },
        database: {
          status: dbStatus,
          message: dbMessage,
          responseTime: dbResponseTime ? `${dbResponseTime}ms` : null
        }
      },
      version: process.env.npm_package_version || '0.1.0'
    };
    
    return NextResponse.json(response, { 
      status: overallStatus === 'healthy' ? 200 : 503 
    });
    
  } catch (error) {
    // Catastrophic failure
    logger.error('Health check catastrophic failure:', error);
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      services: {
        environment: { status: 'unknown' },
        database: { status: 'unknown' }
      }
    }, { status: 500 });
  }
}