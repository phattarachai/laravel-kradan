<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    #[Override]
    public function getConnection(): ?string
    {
        return config('kradan.connection');
    }

    public function up(): void
    {
        $schema = Schema::connection($this->getConnection());

        $schema->create('kradan_boards', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->string('title');
            $table->string('kind', 16);
            $table->string('task_ref', 64)->nullable();
            $table->string('status', 16)->default('open');
            $table->timestamp('decided_at')->nullable();
            $table->string('decided_by', 64)->nullable();
            $table->timestamps();

            $table->index(['kind', 'status']);
        });

        $schema->create('kradan_rounds', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('board_id')->constrained('kradan_boards')->cascadeOnDelete();
            $table->unsignedInteger('number');
            $table->string('title');
            $table->json('steps');
            $table->json('prints');
            $table->timestamp('pushed_at');
            $table->timestamps();

            $table->unique(['board_id', 'number']);
        });

        $schema->create('kradan_picks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('round_id')->constrained('kradan_rounds')->cascadeOnDelete();
            $table->string('step_key', 512);
            $table->string('user_id', 64);
            $table->json('options');
            $table->boolean('seen')->default(false);
            $table->timestamps();

            $table->unique(['round_id', 'step_key', 'user_id']);
        });

        $schema->create('kradan_comments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('round_id')->constrained('kradan_rounds')->cascadeOnDelete();
            $table->string('step_key', 512);
            $table->foreignId('parent_id')->nullable()->constrained('kradan_comments')->cascadeOnDelete();
            $table->string('user_id', 64);
            $table->text('body');
            $table->json('pin')->nullable();
            $table->json('edit')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['round_id', 'step_key']);
        });

        $schema->create('kradan_viewers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('board_id')->constrained('kradan_boards')->cascadeOnDelete();
            $table->string('user_id', 64);
            $table->timestamp('last_seen_at');
            $table->json('seen_prints')->nullable();
            $table->timestamps();

            $table->unique(['board_id', 'user_id']);
        });

        $schema->create('kradan_activity', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('board_id')->constrained('kradan_boards')->cascadeOnDelete();
            $table->foreignId('round_id')->nullable()->constrained('kradan_rounds')->nullOnDelete();
            $table->string('user_id', 64)->nullable();
            $table->string('action', 16);
            $table->json('meta')->nullable();
            $table->timestamp('created_at');

            $table->index(['board_id', 'user_id', 'action', 'created_at']);
        });
    }

    public function down(): void
    {
        $schema = Schema::connection($this->getConnection());

        foreach (['kradan_activity', 'kradan_viewers', 'kradan_comments', 'kradan_picks', 'kradan_rounds', 'kradan_boards'] as $table) {
            $schema->dropIfExists($table);
        }
    }
};
