const express = require('express');
const path = require('path');
const open = require('open');
const chalk = require('chalk');

class StaticWebServer {
  constructor() {
    this.app = express();
    this.setupStaticFiles();
  }

  setupStaticFiles() {
    // 提供静态文件服务
    const publicPath = path.join(__dirname, '../web/public');
    this.app.use(express.static(publicPath));
    
    // 健康检查端点
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'menu-tester-web',
        timestamp: new Date().toISOString()
      });
    });
    
    // 所有其他路由都返回 index.html (支持 SPA 路由)
    this.app.get('*', (req, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
    
    // 错误处理中间件
    this.app.use((err, req, res, next) => {
      console.error('Web server error:', err);
      res.status(500).json({ 
        error: 'Internal server error',
        message: err.message 
      });
    });
  }

  async start(port = 3000, openBrowser = true) {
    return new Promise((resolve, reject) => {
      // 检查端口是否可用
      const server = this.app.listen(port, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        const url = `http://localhost:${port}`;
        
        console.log(chalk.green('🌐 Web 配置界面已启动'));
        console.log(chalk.blue(`   访问地址: ${url}`));
        console.log(chalk.gray('   按 Ctrl+C 停止服务'));
        console.log('');
        
        if (openBrowser) {
          this.openBrowser(url);
        }
        
        // 优雅关闭处理
        process.on('SIGINT', () => {
          console.log(chalk.yellow('\n正在关闭 Web 服务器...'));
          server.close(() => {
            console.log(chalk.green('Web 服务器已关闭'));
            process.exit(0);
          });
        });
        
        resolve({ url, server });
      });
      
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`端口 ${port} 已被占用，请尝试其他端口`));
        } else {
          reject(err);
        }
      });
    });
  }

  async openBrowser(url) {
    try {
      await open(url);
      console.log(chalk.green('✓ 浏览器已自动打开'));
    } catch (error) {
      console.log(chalk.yellow('⚠ 无法自动打开浏览器，请手动访问:'));
      console.log(chalk.blue(`   ${url}`));
    }
  }

  // 查找可用端口
  static async findAvailablePort(startPort = 3000) {
    const net = require('net');
    
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(startPort, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });
      
      server.on('error', () => {
        // 如果端口被占用，尝试下一个
        resolve(StaticWebServer.findAvailablePort(startPort + 1));
      });
    });
  }
}

module.exports = StaticWebServer;
